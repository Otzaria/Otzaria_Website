import mongoose from 'mongoose';
// נתיבים יחסיים (לא '@/') — כדי שטסט-האינטגרציה (recutRequests.int.test.mjs) ירוץ עם node:test
// מול MongoDB אמיתי, וכדי ש-importPackages (שרץ גם מסקריפט node) יוכל לייבא מכאן
import PageProofBook from '../../models/PageProofBook.js';
import PageProofPage from '../../models/PageProofPage.js';
import PageProofSubmission from '../../models/PageProofSubmission.js';
import { revisionFilter, sameRevision, statusAfterReleaseRecut, storedRevision } from './importRules.js';
import {
  MAX_PENDING_RECUT,
  RECUT_CANCEL_NOTE,
  RECUT_MSG,
  RECUT_REVIEWER,
  claimBack,
  recutEligibleFilter,
  recutRefusal,
  recutRequestOps,
  requesterOf,
} from './recutRules.js';

// בקשת מתנדב לזיהוי-מחדש — הצד שכותב למסד (הכללים: recutRules.js).
//
// הבקשה נשמרת כהגשה (PageProofSubmission) עם recutRequest: true, רק עם פעולות-החיתוך,
// "מאושרת" לצורך הזיהוי-מחדש בלבד (status 'approved', reviewedByName = RECUT_REVIEWER), והעמוד
// עובר ל-'recut'. כך כל מה שכבר קיים מטפל בה בלי שינוי: קובץ-התיקונים (?pages=recut&mark=1 —
// תוכנת-הספר מושכת אותה במפתח-הגישה), הייבוא של הגרסה החדשה (importRules.importAction 'recut'),
// ו"שחרור מהמתנה" של המנהל (release_recut) — שמבטל אותה. היא אינה הגשה של העמוד: המונים שלו
// (activeCount/approvedCount/submitters) לא משתנים, והיא אינה נספרת אצל המתנדב.
// כשהגרסה החדשה מיובאת — העמוד חוזר אל מי שביקש (importPackages: recutReturn), ו-recutDoneAt נרשם.

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error) => ({ ok: false, status, error });

// הבקשות הממתינות (לא בוטלו ועוד לא חזרו) — מסנן-Mongo
const PENDING = Object.freeze({ recutRequest: true, status: 'approved', recutDoneAt: null });

export function pendingRecutCount(userId) {
  return PageProofSubmission.countDocuments({ user: oid(userId), ...PENDING });
}

// הבקשה של המתנדב לעמוד. body: {revision, ops}; userName — לתצוגה אצל המנהל.
// ← {ok:true, submissionId, opCount, pending} או {ok:false, status, error}
export async function requestRecut(pageId, userId, { revision, ops, userName = '' } = {}, now = new Date()) {
  const uid = oid(userId);
  const pid = oid(pageId);
  const page = await PageProofPage.findById(pid, {
    doc: 1,
    gid: 1,
    page: 1,
    book: 1,
    revision: 1,
    status: 1,
    leasedBy: 1,
    leasedUntil: 1,
    submitters: 1,
    activeCount: 1,
  }).lean();
  if (!page) return fail(404, 'העמוד לא נמצא');
  const rev = storedRevision(page);
  // הגרסה שנפתחה בעורך — חובה (הפעולות מתייחסות לשורות שלה)
  if (!Number.isInteger(revision) || !sameRevision(revision, rev)) return fail(409, RECUT_MSG.reload);

  const plan = recutRequestOps(page.doc, ops);
  if (plan.error) return fail(400, plan.error);
  const why = recutRefusal(page, uid, now);
  if (why) return fail(409, why);
  if ((await pendingRecutCount(uid)) >= MAX_PENDING_RECUT) return fail(409, RECUT_MSG.tooMany);

  // המעבר open ← recut, אטומי ומותנה (אם בינתיים הוגש, התפיסה פגה או העמוד הוחלף — לא חל).
  // התפיסה משתחררת כמו באישור של תיקון-חיתוך; היא חוזרת למבקש כשהעמוד חוזר
  const before = await PageProofPage.findOneAndUpdate(
    { _id: pid, ...recutEligibleFilter(uid, rev, now) },
    { $set: { status: 'recut', leasedBy: null, leasedUntil: null } },
    { returnDocument: 'before' }
  )
    .select({ leasedUntil: 1 })
    .lean();
  if (!before) {
    const cur = await PageProofPage.findById(pid, { status: 1, revision: 1, leasedBy: 1, leasedUntil: 1, submitters: 1, activeCount: 1 }).lean();
    if (cur && !sameRevision(storedRevision(cur), rev)) return fail(409, RECUT_MSG.reload);
    return fail(409, recutRefusal(cur, uid, now) || 'מצב העמוד השתנה בינתיים — טענו אותו מחדש');
  }

  let sub;
  try {
    sub = await PageProofSubmission.create({
      page: page._id,
      book: page.book,
      gid: page.gid,
      pageNo: page.page,
      user: uid,
      userName: String(userName || ''),
      // כמו pool.whoOf — המזהה שיוצא בשדה who של קובץ-התיקונים
      who: `otz-${String(userId)}`,
      ops: plan.ops,
      opCount: plan.ops.length,
      needsRecut: true,
      revision: rev,
      status: 'approved',
      recutRequest: true,
      reviewedAt: now,
      reviewedByName: RECUT_REVIEWER,
    });
  } catch (e) {
    // ביטול המעבר — העמוד חוזר למתנדב כפי שהיה
    await PageProofPage.updateOne(
      { _id: pid, status: 'recut', ...revisionFilter(rev) },
      { $set: { status: 'open', leasedBy: uid, leasedUntil: before.leasedUntil } }
    );
    throw e;
  }
  return { ok: true, submissionId: String(sub._id), opCount: plan.ops.length, pending: await pendingRecutCount(uid) };
}

// למי העמוד חוזר (הבקשה הממתינה בגרסה הזו) — ObjectId או null
export async function recutRequesterOf(pageId, revision) {
  const reqs = await PageProofSubmission.find(
    { page: oid(pageId), ...PENDING, ...revisionFilter(revision) },
    { user: 1, status: 1, recutRequest: 1, recutDoneAt: 1, createdAt: 1 }
  ).lean();
  return requesterOf(reqs);
}

// הגרסה החדשה של העמוד יובאה: הבקשות של הגרסה הקודמת כבר אינן ממתינות
export async function markRecutDone(pageId, revision, now = new Date()) {
  const res = await PageProofSubmission.updateMany(
    { page: oid(pageId), ...PENDING, ...revisionFilter(revision) },
    { $set: { recutDoneAt: now } }
  );
  return res.modifiedCount || 0;
}

// המנהל שחרר את העמוד מהמתנה (release_recut): הבקשות הממתינות שלו מתבטלות — אחרת אחת מהן הייתה
// נשארת "ההגשה הראשית שמשנה חיתוך" ומחזירה את העמוד ל-'recut' בהגשה הבאה, ויוצאת בקובץ-התיקונים.
// reviewer: {reviewedBy, reviewedByName, reviewedAt}. ← כמה בוטלו
export async function cancelRecutRequests(pageId, revision, reviewer = {}) {
  const res = await PageProofSubmission.updateMany(
    { page: oid(pageId), ...PENDING, ...revisionFilter(revision) },
    { $set: { status: 'rejected', ...reviewer, reviewNote: RECUT_CANCEL_NOTE } }
  );
  return res.modifiedCount || 0;
}

// המעבר של עמוד מ-'recut' בחזרה (ייבוא הגרסה החדשה, או שחרור בידי מנהל) — התפיסה שחוזרת למבקש:
// {leasedBy, leasedUntil} או {} (לא הייתה בקשה)
export async function recutReturn(pageId, revision, now = new Date()) {
  return claimBack(await recutRequesterOf(pageId, revision), now);
}

// "העמודים שלי": העמודים שהמתנדב שלח לזיהוי-מחדש ועוד לא חזרו — [{id, gid, title, page,
// requestedAt, picked}] (picked — תוכנת-הספר כבר משכה את הבקשה)
export async function recutPendingOf(userId) {
  const reqs = await PageProofSubmission.find(
    { user: oid(userId), ...PENDING },
    { page: 1, book: 1, gid: 1, pageNo: 1, createdAt: 1, exportedAt: 1 }
  )
    .sort({ createdAt: 1 })
    .limit(MAX_PENDING_RECUT * 4)
    .lean();
  if (!reqs.length) return [];
  const books = await PageProofBook.find({ _id: { $in: [...new Set(reqs.map((r) => String(r.book)))].map(oid) } }, { title: 1 }).lean();
  const titleOf = new Map(books.map((b) => [String(b._id), b.title]));
  return reqs.map((r) => ({
    id: String(r.page),
    gid: r.gid,
    title: titleOf.get(String(r.book)) || '',
    page: r.pageNo,
    requestedAt: r.createdAt,
    picked: !!r.exportedAt,
  }));
}

// כמה בקשות-מתנדבים ממתינות (בכל האתר, או בספר): {waiting, picked} — picked = תוכנת-הספר כבר משכה
// אותן (exportedAt) והן בטיפול שם; waiting = עוד לא
export async function pendingRecutTotals(gid = null) {
  const q = { ...PENDING, ...(gid ? { gid: String(gid) } : {}) };
  const [all, picked] = await Promise.all([
    PageProofSubmission.countDocuments(q),
    PageProofSubmission.countDocuments({ ...q, exportedAt: { $ne: null } }),
  ]);
  return { waiting: all - picked, picked };
}

// "החזר את כל הממתינים למתנדבים" (מתג המנהל, 2026-10-02): כל בקשה שעוד לא נמשכה לתוכנת-הספר
// מתבטלת, והעמוד חוזר אל המתנדב שביקש — בדיוק כמו "שחרור מהמתנה" של עמוד בודד (release_recut):
// התפיסה שלו מתחדשת, והטיוטה שלו (תיקוני-החיתוך ושאר התיקונים) מחכה לו בדפדפן. בקשה שכבר נמשכה —
// בטיפול בתוכנה ותחזור בגרסה חדשה; לא נוגעים בה (נספרת ב-picked). gid (רשות) — רק בספר הזה.
// reviewer: {reviewedBy, reviewedByName, reviewedAt}. ← {released, skipped, picked}
export async function releaseAllRecutRequests({ gid = null, reviewer = {}, now = new Date() } = {}) {
  const q = { ...PENDING, exportedAt: null, ...(gid ? { gid: String(gid) } : {}) };
  const reqs = await PageProofSubmission.find(q, { page: 1, revision: 1 }).lean();
  const pages = new Map();
  for (const r of reqs) pages.set(String(r.page), r.revision ?? 1);
  let released = 0;
  let skipped = 0;
  for (const [pid, rev] of pages) {
    const page = await PageProofPage.findById(oid(pid), { status: 1, revision: 1, activeCount: 1, required: 1 }).lean();
    if (!page || page.status !== 'recut' || !sameRevision(storedRevision(page), rev)) {
      skipped++;
      continue;
    }
    const next = statusAfterReleaseRecut(page);
    const back = next === 'open' ? await recutReturn(pid, rev, now) : {};
    const r = await PageProofPage.updateOne({ _id: oid(pid), status: 'recut', ...revisionFilter(rev) }, { $set: { status: next, ...back } });
    if (!r.matchedCount) {
      skipped++;
      continue;
    }
    await cancelRecutRequests(pid, rev, reviewer);
    released++;
  }
  const { picked } = await pendingRecutTotals(gid);
  return { released, skipped, picked };
}

// לרשת-העמודים של המנהל: הבקשות הממתינות בספר ← Map(pageId → {id, by, at, picked, revision})
export async function recutRequestsOfBook(gid) {
  const reqs = await PageProofSubmission.find(
    { gid: String(gid), ...PENDING },
    { page: 1, userName: 1, createdAt: 1, exportedAt: 1, revision: 1 }
  )
    .sort({ createdAt: 1 })
    .lean();
  const out = new Map();
  for (const r of reqs) {
    out.set(String(r.page), { id: String(r._id), by: r.userName || '', at: r.createdAt, picked: !!r.exportedAt, revision: r.revision ?? 1 });
  }
  return out;
}
