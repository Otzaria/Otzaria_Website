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
async function isReferencedElsewhere(report, id) {
  if (await AppReport.exists({ _id: { $ne: report._id }, $or: REF_PATHS.map((path) => ({ [path]: id })) })) return true;
  const files = await FileStorage.find({ gridfsId: id }).select('_id').lean();
  return files.length > 0 && Boolean(await Upload.exists({ fileStorageId: { $in: files.map((f) => f._id) }, isDeleted: { $ne: true } }));
}

/** מחיקה חוזרת משלימה גם chunks שנשארו אחרי כשל בין מחיקת המטא־דטה למחיקת התוכן. */
export async function deleteReportPayloadFile(id) {
  const db = mongoose.connection.db;
  const objectId = new mongoose.Types.ObjectId(id);
  const file = await db.collection('uploads.files').findOne({ _id: objectId }, { projection: { length: 1, 'metadata.appReportId': 1 } });
  // אין למחוק קובץ זר רק מפני שמזהה שלו הופיע ברשומה פגומה.
  if (file && !file.metadata?.appReportId) throw new Error('הקובץ אינו מזוהה כצרופת דיווח');
  try {
    await new GridFSBucket(db, { bucketName: 'uploads' }).delete(objectId);
  } catch (err) {
    // GridFS מוחק chunks גם כשהמסמך כבר חסר, ואז זורק שגיאה זו. כשל אחר אינו הצלחה.
    if (err?.name !== 'MongoRuntimeError' || err.message !== `File not found for id ${objectId}`) throw err;
  }
  await FileStorage.updateMany({ gridfsId: objectId }, { $set: { isDeleted: true } });
  return { missing: !file, bytes: file?.length || 0 };
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

/** clock/deps.now מאפשרים בדיקת גבול מדויק ללא sleep. אין סריקת קבצים או קריאת התוכן. */
export async function cleanupClosedReportPayloads(deps = {}) {
  const clock = deps.clock || (() => deps.now || new Date());
  const now = clock();
  const cutoff = new Date(now.getTime() - PAYLOAD_RETENTION_MS);
  const summary = { checked: 0, purged: 0, files: 0, bytes: 0, shared: 0, missing: 0, deferred: 0, errors: 0 };
  const eligible = {
    issueState: 'closed', issuePending: false, issueNumber: { $ne: null },
    issueClosedAt: { $type: 'date', $lte: cutoff }, contactLog: readyReplies,
    'payloadCleanup.purgedAt': null,
    $and: [
      { $or: [{ 'payloadCleanup.nextAttemptAt': null }, { 'payloadCleanup.nextAttemptAt': { $lte: now } }] },
      { $or: [{ 'payloadCleanup.leaseUntil': null }, { 'payloadCleanup.leaseUntil': { $lte: now } }] },
    ],
  };
  const candidates = await AppReport.find(eligible).select('_id reportId product issueNumber issueClosedAt issueCheckedAt issueStateRevision')
    .sort({ 'payloadCleanup.nextAttemptAt': 1, issueClosedAt: 1, _id: 1 }).limit(CLEANUP_REPORT_BATCH).lean();
  let remaining = CLEANUP_FILE_BATCH;
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
        const shared = await isReferencedElsewhere(doc, ref.id);
        if (!await AppReport.exists({ ...guard, 'payloadCleanup.leaseUntil': { $gt: clock() } })) {
          cancelled = true;
          summary.deferred += 1;
          break;
        }
        remaining -= 1;
        const outcome = shared ? { shared: true, bytes: 0, missing: false }
          : await (deps.deletePayloadFile || deleteReportPayloadFile)(ref.id);
        // עדכון מותנה גם אחרי I/O: ריצה ישנה לא תסמן סגירה חדשה כנקייה.
        const updated = await AppReport.updateOne(guard, detachUpdate(ref, outcome, at, closedAt));
        if (!updated.modifiedCount) { cancelled = true; summary.deferred += 1; break; }
        summary.files += 1;
        summary.bytes += outcome.bytes;
        summary.shared += shared ? 1 : 0;
        summary.missing += outcome.missing ? 1 : 0;
      }
      if (!cancelled) {
        const current = await AppReport.findOne(guard).select('fileIds contactLog.images').lean();
        const complete = current && payloadRefs(current).length === 0;
        const finished = await AppReport.updateOne(guard, { $set: {
          'payloadCleanup.leaseToken': null, 'payloadCleanup.leaseUntil': null,
          'payloadCleanup.nextAttemptAt': complete ? null : clock(),
          'payloadCleanup.purgedAt': complete ? clock() : null,
          'payloadCleanup.closedAt': closedAt,
        } });
        if (complete && finished.modifiedCount) summary.purged += 1;
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
