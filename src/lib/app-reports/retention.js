/** ניקוי צרופות בלבד אחרי 168 שעות מסגירה מאומתת. רשומת הדיווח והיסטוריית הטיפול נשארות. */
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import AppReport from '../../models/AppReport.js';
import FileStorage from '../../models/FileStorage.js';
import Upload from '../../models/Upload.js';
import { createGithubClient } from './github.js';
import { getProduct, productOf } from './products.js';
import { issueStateFields, trustedIssueClosedAt } from './state-change.js';

export const PAYLOAD_RETENTION_MS = 168 * 60 * 60 * 1000;
export const CLEANUP_REPORT_BATCH = 10;
export const CLEANUP_FILE_BATCH = 40;
export const CLEANUP_RETRY_MS = 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const REF_PATHS = ['fileIds.diagnostics.gridfsId', 'fileIds.errors.gridfsId', 'fileIds.minidump.gridfsId', 'fileIds.images.gridfsId', 'contactLog.images.gridfsId'];
const readyReplies = { $not: { $elemMatch: { issueComment: { $in: ['pending', 'posting'] } } } };
// $elemMatch checks every image, including a nonempty entry beside a null/legacy entry.
const payloadPresent = [
  ...['diagnostics', 'errors', 'minidump'].map((kind) => ({ [`fileIds.${kind}.gridfsId`]: { $ne: null } })),
  { 'fileIds.images': { $elemMatch: { gridfsId: { $ne: null } } } },
  { contactLog: { $elemMatch: { images: { $elemMatch: { gridfsId: { $ne: null } } } } } },
];

function payloadRefs(doc) {
  const refs = new Map();
  const add = (ref, kind, path) => {
    if (!ref?.gridfsId) return;
    const key = String(ref.gridfsId);
    if (!refs.has(key)) refs.set(key, { id: ref.gridfsId, size: ref.size || 0, kinds: new Set(), paths: [] });
    refs.get(key).kinds.add(kind);
    refs.get(key).paths.push(path);
  };
  for (const kind of ['diagnostics', 'errors', 'minidump']) add(doc.fileIds?.[kind], kind, `fileIds.${kind}`);
  for (const image of doc.fileIds?.images || []) add(image, 'image', 'fileIds.images');
  for (const [i, entry] of (doc.contactLog || []).entries()) {
    for (const image of entry.images || []) add(image, 'reply-image', `contactLog.${i}.images`);
  }
  return [...refs.values()];
}

/** אין במערכת מסלול שמשתף מזהה קיים בכתיבה: כל קליטה מקצה GridFS חדש.
 * בכל זאת שומרים קבצים שמשותפים לרשומה אחרת (לרבות נתונים ישנים או ייבוא). */
async function sharedReference(report, id) {
  const other = await AppReport.findOne({
    _id: { $ne: report._id }, $or: REF_PATHS.map((path) => ({ [path]: id })),
  }).select('reportId').sort({ _id: 1 }).lean();
  if (other) return { shared: true, nextOwnerReportId: other.reportId };
  const files = await FileStorage.find({ gridfsId: id }).select('_id').lean();
  const upload = files.length > 0 && Boolean(await Upload.exists({
    fileStorageId: { $in: files.map((f) => f._id) }, isDeleted: { $ne: true },
  }));
  return { shared: upload, nextOwnerReportId: null };
}

async function transferPayloadOwner(id, fromReportId, toReportId) {
  if (!toReportId || String(fromReportId) === String(toReportId)) return;
  await mongoose.connection.db.collection('uploads.files').updateOne({
    _id: new mongoose.Types.ObjectId(id), 'metadata.appReportId': fromReportId,
  }, { $set: { 'metadata.appReportId': toReportId } });
}

/** מחיקה חוזרת משלימה גם chunks שנשארו אחרי כשל בין מחיקת המטא־דטה למחיקת התוכן. */
export async function deleteReportPayloadFile(id, expectedReportId) {
  const db = mongoose.connection.db;
  const objectId = new mongoose.Types.ObjectId(id);
  const file = await db.collection('uploads.files').findOne({ _id: objectId }, { projection: { length: 1, 'metadata.appReportId': 1 } });
  // אין למחוק קובץ זר רק מפני שמזהה שלו הופיע ברשומה פגומה.
  if (file && String(file.metadata?.appReportId ?? '') !== String(expectedReportId ?? '')) {
    throw new Error('הקובץ אינו שייך לדיווח');
  }
  try {
    await new GridFSBucket(db, { bucketName: 'uploads' }).delete(objectId);
  } catch (err) {
    // GridFS מוחק chunks גם כשהמסמך כבר חסר, ואז זורק שגיאה זו. כשל אחר אינו הצלחה.
    if (err?.name !== 'MongoRuntimeError' || err.message !== `File not found for id ${objectId}`) throw err;
  }
  await FileStorage.updateMany({ gridfsId: objectId }, { $set: { isDeleted: true } });
  return { missing: !file, bytes: file?.length || 0 };
}

async function assertPayloadOwner(id, expectedReportId) {
  const file = await mongoose.connection.db.collection('uploads.files').findOne(
    { _id: new mongoose.Types.ObjectId(id) }, { projection: { 'metadata.appReportId': 1 } },
  );
  if (file && String(file.metadata?.appReportId ?? '') !== String(expectedReportId ?? '')) {
    throw new Error('הקובץ אינו שייך לדיווח');
  }
}

function guardFor(doc, token) {
  return {
    _id: doc._id, issueNumber: doc.issueNumber, issueState: 'closed', issuePending: false,
    issueClosedAt: doc.issueClosedAt, contactLog: readyReplies, 'payloadCleanup.leaseToken': token,
    issueStateRevision: doc.issueStateRevision,
  };
}

function detachUpdate(ref, outcome, now, closedAt) {
  const $set = {
    'payloadCleanup.lastAttemptAt': now, 'payloadCleanup.closedAt': closedAt,
    'payloadCleanup.lastError': null,
  };
  const $pull = {};
  for (const path of new Set(ref.paths)) {
    if (path.endsWith('.images')) $pull[path] = { gridfsId: ref.id };
    else $set[path] = null;
  }
  return {
    $set, ...(Object.keys($pull).length ? { $pull } : {}),
    $inc: {
      'payloadCleanup.removedFiles': 1,
      'payloadCleanup.removedBytes': outcome.bytes,
      'payloadCleanup.sharedFiles': outcome.shared ? 1 : 0,
      'payloadCleanup.missingFiles': outcome.missing ? 1 : 0,
    },
    $addToSet: { 'payloadCleanup.kinds': { $each: [...ref.kinds] } },
  };
}

// ניתוק ההפניה והרישום בתור אטומיים גם לקובץ משותף: כשל בהעברת בעלות
// חייב להישאר ניתן לניסיון חוזר, בלי לאבד את ההפניה לפעולת האחסון.
function stageDeleteUpdate(ref, reportId, now, closedAt) {
  const update = detachUpdate(ref, { bytes: 0, shared: false, missing: false }, now, closedAt);
  delete update.$inc;
  update.$push = { 'payloadCleanup.pendingDeletes': {
    gridfsId: ref.id, ownerReportId: reportId, size: ref.size || 0,
    kinds: [...ref.kinds], detachedAt: now,
  } };
  return update;
}

async function claimPendingDelete(report, pending, now) {
  const token = randomUUID();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const claimed = await AppReport.findOneAndUpdate({
    _id: report._id,
    'payloadCleanup.pendingDeletes': { $elemMatch: {
      gridfsId: pending.gridfsId,
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    } },
  }, {
    $set: {
      'payloadCleanup.pendingDeletes.$.leaseToken': token,
      'payloadCleanup.pendingDeletes.$.leaseUntil': leaseUntil,
    },
  }, { returnDocument: 'after' }).select('payloadCleanup.pendingDeletes').lean();
  if (!claimed) return null;
  const item = claimed.payloadCleanup.pendingDeletes.find((entry) =>
    String(entry.gridfsId) === String(pending.gridfsId) && entry.leaseToken === token);
  return item ? { ...item, token } : null;
}

async function finalizePendingDelete(report, pending, outcome, now) {
  const result = await AppReport.updateOne({
    _id: report._id, 'payloadCleanup.pendingDeletes': { $elemMatch: {
      gridfsId: pending.gridfsId, leaseToken: pending.token,
    } },
  }, {
    $pull: { 'payloadCleanup.pendingDeletes': { gridfsId: pending.gridfsId } },
    $set: {
      'payloadCleanup.lastAttemptAt': now, 'payloadCleanup.lastError': null,
      'payloadCleanup.nextAttemptAt': null,
    },
    $inc: {
      'payloadCleanup.removedFiles': 1,
      'payloadCleanup.removedBytes': outcome.bytes,
      'payloadCleanup.sharedFiles': outcome.shared ? 1 : 0,
      'payloadCleanup.missingFiles': outcome.missing ? 1 : 0,
    },
    $addToSet: { 'payloadCleanup.kinds': { $each: pending.kinds || [] } },
  });
  return result.modifiedCount > 0;
}

async function drainPendingDelete(report, pending, deps, now) {
  const claimed = await claimPendingDelete(report, pending, now);
  if (!claimed) return null;
  // הגנה נוספת לנתונים מיובאים/פגומים שנוספה בהם הפניה לאחר הניתוק.
  const sharing = await sharedReference(report, claimed.gridfsId);
  const outcome = sharing.shared ? { shared: true, bytes: 0, missing: false }
    : await (deps.deletePayloadFile || deleteReportPayloadFile)(claimed.gridfsId, claimed.ownerReportId);
  if (sharing.shared) await transferPayloadOwner(claimed.gridfsId, claimed.ownerReportId, sharing.nextOwnerReportId);
  const finalized = await finalizePendingDelete(report, { ...claimed, token: claimed.token }, outcome, now);
  return finalized ? outcome : null;
}

/** clock/deps.now מאפשרים בדיקת גבול מדויק ללא sleep. אין סריקת קבצים או קריאת התוכן. */
export async function cleanupClosedReportPayloads(deps = {}) {
  const clock = deps.clock || (() => deps.now || new Date());
  const now = clock();
  const cutoff = new Date(now.getTime() - PAYLOAD_RETENTION_MS);
  const summary = { checked: 0, purged: 0, files: 0, bytes: 0, shared: 0, missing: 0, deferred: 0, errors: 0 };
  let remaining = CLEANUP_FILE_BATCH;
  // ניתוקים שכבר committed מושלמים ללא תלות במצב ה-issue הנוכחי. הם אינם עוד
  // חלק מהדיווח, וזו רשת ההתאוששות מקריסה בין עדכון Mongo למחיקת GridFS.
  const pendingReports = await AppReport.find({
    'payloadCleanup.pendingDeletes.0': { $exists: true },
    $or: [{ 'payloadCleanup.nextAttemptAt': null }, { 'payloadCleanup.nextAttemptAt': { $lte: now } }],
  }).select('_id reportId fileIds contactLog.images payloadCleanup.pendingDeletes').limit(CLEANUP_REPORT_BATCH).lean();
  for (const report of pendingReports) {
    for (const pending of report.payloadCleanup?.pendingDeletes || []) {
      if (!remaining) break;
      remaining -= 1;
      try {
        const outcome = await drainPendingDelete(report, pending, deps, clock());
        if (!outcome) continue;
        summary.files += 1;
        summary.bytes += outcome.bytes;
        summary.shared += outcome.shared ? 1 : 0;
        summary.missing += outcome.missing ? 1 : 0;
      } catch (err) {
        summary.errors += 1;
        const at = clock();
        await AppReport.updateOne({ _id: report._id }, { $set: {
          'payloadCleanup.lastAttemptAt': at,
          'payloadCleanup.nextAttemptAt': new Date(at.getTime() + CLEANUP_RETRY_MS),
          'payloadCleanup.lastError': String(err?.message || err).slice(0, 500),
        } });
        console.error(`App report pending payload cleanup: ${report.reportId}:`, err?.message);
        break;
      }
    }
    if (!remaining) break;
  }
  const eligible = {
    issueState: 'closed', issuePending: false, issueNumber: { $ne: null },
    issueClosedAt: { $type: 'date', $lte: cutoff }, contactLog: readyReplies,
    'payloadCleanup.purgedAt': null,
    $and: [
      { $or: [{ 'payloadCleanup.nextAttemptAt': null }, { 'payloadCleanup.nextAttemptAt': { $lte: now } }] },
      { $or: [{ 'payloadCleanup.leaseUntil': null }, { 'payloadCleanup.leaseUntil': { $lte: now } }] },
    ],
  };
  const reportBudget = Math.max(0, CLEANUP_REPORT_BATCH - pendingReports.length);
  const candidates = reportBudget ? await AppReport.find({
    ...eligible, _id: { $nin: pendingReports.map((report) => report._id) },
  }).select('_id reportId product issueNumber issueClosedAt issueCheckedAt issueStateRevision')
    .sort({ 'payloadCleanup.nextAttemptAt': 1, issueClosedAt: 1, _id: 1 }).limit(reportBudget).lean() : [];
  for (const candidate of candidates) {
    if (!remaining) break;
    summary.checked += 1;
    const product = productOf(candidate);
    const github = deps.githubFor ? deps.githubFor(product) : deps.config?.githubToken
      ? createGithubClient({ token: deps.config.githubToken, repo: getProduct(product).repo, fetchImpl: deps.fetchImpl }) : null;
    let token = null;
    try {
      if (!github) throw new Error('אין חיבור GitHub לאימות הסגירה');
      // מצב ומועד הסגירה נשלפים שוב ממקור האמת, גם אם webhook של פתיחה מחדש אבד.
      const issue = await github.getIssue(candidate.issueNumber);
      if (!['open', 'closed'].includes(issue?.state)) throw new Error('מצב issue לא מוכר');
      const verifiedAt = clock();
      const closedAt = trustedIssueClosedAt(issue);
      // תשובת GET עשויה להיות ישנה ביחס ל-webhook שהגיע בזמן הבקשה.
      // שום תוצאה אינה נכתבת בלי התאמה למצב שקראנו לפני הפנייה החיצונית.
      const snapshotGuard = {
        ...eligible, _id: candidate._id, issueNumber: candidate.issueNumber,
        issueClosedAt: candidate.issueClosedAt, issueCheckedAt: candidate.issueCheckedAt ?? null,
        issueStateRevision: candidate.issueStateRevision ?? null,
      };
      if (!closedAt || closedAt.getTime() > verifiedAt.getTime() - PAYLOAD_RETENTION_MS) {
        await AppReport.updateOne(snapshotGuard, {
          $set: issueStateFields(issue, verifiedAt), $inc: { issueStateRevision: 1 },
        });
        summary.deferred += 1;
        continue;
      }
      token = randomUUID();
      // אימות המצב ותפיסת הנעילה הן כתיבה אטומית אחת; ריצה מקבילה לא
      // תשתמש בסגירה חדשה (או במצב פתוח) כאילו היו התשובה שאומתה כאן.
      const doc = await AppReport.findOneAndUpdate(snapshotGuard, {
        $set: {
          ...issueStateFields(issue, verifiedAt),
          'payloadCleanup.leaseToken': token, 'payloadCleanup.leaseUntil': new Date(verifiedAt.getTime() + LEASE_MS),
          'payloadCleanup.lastAttemptAt': verifiedAt, 'payloadCleanup.lastError': null,
        },
        $inc: { issueStateRevision: 1 },
      }, { returnDocument: 'after' }).select('_id reportId issueNumber issueClosedAt issueStateRevision fileIds contactLog.images').lean();
      if (!doc) { summary.deferred += 1; continue; }
      const guard = guardFor(doc, token);
      let cancelled = false;
      for (const ref of payloadRefs(doc)) {
        if (!remaining) break;
        const at = clock();
        // פתיחה מחדש/סגירה חדשה או תשובה שעוד ממתינה לפרסום מבטלות את הרשאת הניקוי.
        if (!await AppReport.exists({ ...guard, 'payloadCleanup.leaseUntil': { $gt: at } })) {
          cancelled = true;
          summary.deferred += 1;
          break;
        }
        const sharing = await sharedReference(doc, ref.id);
        const shared = sharing.shared;
        if (!shared) await assertPayloadOwner(ref.id, doc.reportId);
        if (!await AppReport.exists({ ...guard, 'payloadCleanup.leaseUntil': { $gt: clock() } })) {
          cancelled = true;
          summary.deferred += 1;
          break;
        }
        const updated = await AppReport.updateOne(guard, stageDeleteUpdate(ref, doc.reportId, at, closedAt));
        if (!updated.modifiedCount) { cancelled = true; summary.deferred += 1; break; }
        remaining -= 1;
        const outcome = await drainPendingDelete(doc, {
          gridfsId: ref.id, ownerReportId: doc.reportId, size: ref.size || 0, kinds: [...ref.kinds],
        }, deps, at);
        if (!outcome) { cancelled = true; summary.deferred += 1; break; }
        summary.files += 1;
        summary.bytes += outcome.bytes;
        summary.shared += outcome.shared ? 1 : 0;
        summary.missing += outcome.missing ? 1 : 0;
      }
      if (!cancelled) {
        // The emptiness check and completion marker must be one Mongo write:
        // an inbound image can arrive after the last detach, without changing issue state.
        const finished = await AppReport.updateOne({
          ...guard, $nor: payloadPresent, 'payloadCleanup.pendingDeletes.0': { $exists: false },
        }, { $set: {
          'payloadCleanup.leaseToken': null, 'payloadCleanup.leaseUntil': null,
          'payloadCleanup.nextAttemptAt': null, 'payloadCleanup.purgedAt': clock(),
          'payloadCleanup.closedAt': closedAt,
        } });
        if (finished.modifiedCount) summary.purged += 1;
        else await AppReport.updateOne(guard, { $set: {
          'payloadCleanup.leaseToken': null, 'payloadCleanup.leaseUntil': null,
          'payloadCleanup.nextAttemptAt': clock(), 'payloadCleanup.purgedAt': null,
        } });
      }
    } catch (err) {
      summary.errors += 1;
      const at = clock();
      await AppReport.updateOne({ _id: candidate._id, ...(token ? { 'payloadCleanup.leaseToken': token } : {
        $or: [{ 'payloadCleanup.leaseUntil': null }, { 'payloadCleanup.leaseUntil': { $lte: at } }],
      }) }, { $set: {
        'payloadCleanup.leaseToken': null, 'payloadCleanup.leaseUntil': null,
        'payloadCleanup.lastAttemptAt': at, 'payloadCleanup.nextAttemptAt': new Date(at.getTime() + CLEANUP_RETRY_MS),
        'payloadCleanup.lastError': String(err?.message || err).slice(0, 500),
      } });
      console.error(`App report payload cleanup: ${candidate.reportId}:`, err?.message);
    }
  }
  return summary;
}
