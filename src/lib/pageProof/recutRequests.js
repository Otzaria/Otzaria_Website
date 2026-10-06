import mongoose from 'mongoose';
// נתיבים יחסיים (לא '@/') — כדי שטסט-האינטגרציה (recutRequests.int.test.mjs) ירוץ עם node:test
// מול MongoDB אמיתי, וכדי ש-importPackages (שרץ גם מסקריפט node) יוכל לייבא מכאן
import PageProofBook from '../../models/PageProofBook.js';
import PageProofDraft from '../../models/PageProofDraft.js';
import PageProofPage from '../../models/PageProofPage.js';
import PageProofSubmission from '../../models/PageProofSubmission.js';
import { revisionFilter, sameRevision, statusAfterReleaseRecut, storedRevision } from './importRules.js';
import {
  ASK_MSG,
  MAX_PENDING_RECUT,
  RECUT_CANCEL_NOTE,
  askEligibleFilter,
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
    sub = await createRecutRequest(page, uid, { userName, ops: plan.ops, revision: rev, now });
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

// ההגשה-הבקשה (recutRequest) — "מאושרת" לצורך הזיהוי-מחדש בלבד. reviewer — מי אישר כשזה מנהל (askDecide), אחרת
// "בקשת מתנדב לזיהוי-מחדש"
function createRecutRequest(page, uid, { userName = '', ops, revision, now, reviewer = null }) {
  return PageProofSubmission.create({
    page: page._id,
    book: page.book,
    gid: page.gid,
    pageNo: page.page,
    user: uid,
    userName: String(userName || ''),
    // כמו pool.whoOf — המזהה שיוצא בשדה who של קובץ-התיקונים
    who: `otz-${String(uid)}`,
    ops,
    opCount: ops.length,
    needsRecut: true,
    revision,
    status: 'approved',
    recutRequest: true,
    reviewedAt: now,
    reviewedByName: reviewer?.reviewedByName || RECUT_REVIEWER,
    ...(reviewer?.reviewedBy ? { reviewedBy: reviewer.reviewedBy } : {}),
  });
}

// ---------- בקשה שממתינה לאישור מנהל (recut_ask; recutRules.recutRoute) ----------

// "המבנה נכון" עם תיקון-חיתוך, כשאי אפשר לשלוח בלי מנהל (reason — ASK_REASONS): העמוד עובר ל-'recut_ask' — נעול, לא
// מוצע ולא נספר בעמודים שהמתנדב מחזיק — ותיקוני-החיתוך נשמרים עליו (recutAsk), ארוזים ונבדקים כמו בהגשה. התפיסה
// משתחררת; היא חוזרת למבקש כשהעמוד חוזר (מהזיהוי-מחדש, או בדחייה). ← {ok, asked:true, reason, opCount} או {ok:false,…}
export async function askRecut(pageId, userId, { revision, ops, userName = '', reason = '' } = {}, now = new Date()) {
  const uid = oid(userId);
  const pid = oid(pageId);
  const page = await PageProofPage.findById(pid, { doc: 1, revision: 1, status: 1 }).lean();
  if (!page) return fail(404, 'העמוד לא נמצא');
  const rev = storedRevision(page);
  if (!Number.isInteger(revision) || !sameRevision(revision, rev)) return fail(409, RECUT_MSG.reload);
  const plan = recutRequestOps(page.doc, ops);
  if (plan.error) return fail(400, plan.error);
  const r = await PageProofPage.updateOne(
    { _id: pid, ...askEligibleFilter(uid, rev, now) },
    {
      $set: {
        status: 'recut_ask',
        leasedBy: null,
        leasedUntil: null,
        recutAsk: { user: uid, userName: String(userName || ''), ops: plan.ops, revision: rev, reason: String(reason || ''), at: now },
      },
    }
  );
  if (!r.matchedCount) {
    const cur = await PageProofPage.findById(pid, { status: 1, revision: 1, leasedBy: 1, leasedUntil: 1, submitters: 1 }).lean();
    if (cur && !sameRevision(storedRevision(cur), rev)) return fail(409, RECUT_MSG.reload);
    return fail(409, recutRefusal({ ...cur, activeCount: 0 }, uid, now) || 'מצב העמוד השתנה בינתיים — טענו אותו מחדש');
  }
  // הטיוטה: כשהעמוד יחזור — שלב "טקסט" (כמו בשליחה רגילה — serverDrafts.markRecutSent)
  await PageProofDraft.updateOne({ page: pid, by: uid }, { $set: { stage: 'text', recut: { sentAt: now, asked: true } } }).catch(() => {});
  return { ok: true, asked: true, reason, opCount: plan.ops.length, message: ASK_MSG.asked };
}

// המנהל מכריע בבקשה: approve ← העמוד ממתין לזיהוי-מחדש ('recut') עם בקשה רגילה בשם המתנדב (כך הוא חוזר אליו); reject
// ← העמוד חוזר למתנדב ('open', התפיסה מתחדשת), לשלב הטקסט, עם הודעה — ותיקוני-החיתוך יוצאים עם ההגשה, כמו קודם.
// reviewer: {reviewedBy, reviewedByName}. ← {ok, decision} או {ok:false,…}
export async function decideRecutAsk(pageId, decision, reviewer = {}, { note = '', now = new Date() } = {}) {
  if (decision !== 'approve' && decision !== 'reject') return fail(400, 'פעולה לא מוכרת — approve או reject');
  const pid = oid(pageId);
  const page = await PageProofPage.findById(pid, { book: 1, gid: 1, page: 1, revision: 1, status: 1, recutAsk: 1 }).lean();
  if (!page) return fail(404, 'העמוד לא נמצא');
  const ask = page.recutAsk;
  if (page.status !== 'recut_ask' || !ask?.user) return fail(409, ASK_MSG.notAsk);
  const rev = storedRevision(page);
  const cond = { _id: pid, status: 'recut_ask', ...revisionFilter(rev) };
  if (decision === 'approve') {
    const r = await PageProofPage.updateOne(cond, { $set: { status: 'recut', recutAsk: null } });
    if (!r.matchedCount) return fail(409, ASK_MSG.notAsk);
    try {
      await createRecutRequest(page, oid(ask.user), { userName: ask.userName, ops: ask.ops || [], revision: rev, now, reviewer });
    } catch (e) {
      await PageProofPage.updateOne({ _id: pid, status: 'recut', ...revisionFilter(rev) }, { $set: { status: 'recut_ask', recutAsk: ask } });
      throw e;
    }
    return { ok: true, decision };
  }
  const r = await PageProofPage.updateOne(cond, { $set: { status: 'open', recutAsk: null, ...claimBack(ask.user, now) } });
  if (!r.matchedCount) return fail(409, ASK_MSG.notAsk);
  const why = String(note || '').trim().slice(0, 500);
  await PageProofDraft.updateOne(
    { page: pid, by: oid(ask.user) },
    { $set: { stage: 'text', recut: { sentAt: ask.at || now, asked: true, rejectedAt: now, note: why } } }
  ).catch(() => {});
  return { ok: true, decision };
}

// כמה עמודים ממתינים לאישור מנהל לזיהוי-מחדש (בכל האתר, או בספר)
export function recutAskCount(gid = null) {
  return PageProofPage.countDocuments({ status: 'recut_ask', ...(gid ? { gid: String(gid) } : {}) });
}

// הבקשות שממתינות לאישור מנהל: בכל האתר (gid=null) או בספר ← [{id, gid, page, by, at, reason, opCount}]
export async function recutAsksOf(gid = null) {
  const pages = await PageProofPage.find(
    { status: 'recut_ask', ...(gid ? { gid: String(gid) } : {}) },
    { gid: 1, page: 1, recutAsk: 1 }
  )
    .sort({ 'recutAsk.at': 1 })
    .limit(500)
    .lean();
  return pages.map((p) => ({
    id: String(p._id),
    gid: p.gid,
    page: p.page,
    by: p.recutAsk?.userName || '',
    at: p.recutAsk?.at || null,
    reason: p.recutAsk?.reason || '',
    opCount: (p.recutAsk?.ops || []).length,
  }));
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
  // ...ועמודים שממתינים לאישור מנהל (recut_ask) — נעולים עד שיחזרו, ומוצגים באותה רשימה ("ממתין לאישור מנהל")
  const asks = await PageProofPage.find({ status: 'recut_ask', 'recutAsk.user': oid(userId) }, { book: 1, gid: 1, page: 1, recutAsk: 1 })
    .sort({ 'recutAsk.at': 1 })
    .limit(MAX_PENDING_RECUT * 4)
    .lean();
  if (!reqs.length && !asks.length) return [];
  const bookIds = [...new Set([...reqs.map((r) => String(r.book)), ...asks.map((p) => String(p.book))])];
  const books = await PageProofBook.find({ _id: { $in: bookIds.map(oid) } }, { title: 1 }).lean();
  const titleOf = new Map(books.map((b) => [String(b._id), b.title]));
  return [
    ...asks.map((p) => ({
      id: String(p._id),
      gid: p.gid,
      title: titleOf.get(String(p.book)) || '',
      page: p.page,
      requestedAt: p.recutAsk?.at || null,
      picked: false,
      asked: true,
    })),
    ...reqs.map((r) => ({
      id: String(r.page),
      gid: r.gid,
      title: titleOf.get(String(r.book)) || '',
      page: r.pageNo,
      requestedAt: r.createdAt,
      picked: !!r.exportedAt,
    })),
  ];
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
