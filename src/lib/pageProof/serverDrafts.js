import mongoose from 'mongoose';
// נתיבים יחסיים (לא '@/') — כדי שטסט-האינטגרציה (serverDrafts.int.test.mjs) ירוץ עם node:test מול MongoDB אמיתי
import PageProofDraft from '../../models/PageProofDraft.js';
import PageProofPage from '../../models/PageProofPage.js';
import PageProofSubmission from '../../models/PageProofSubmission.js';
import { revisionFilter, sameRevision, storedRevision } from './importRules.js';
import { carryDraftOps, droppedOpLabel } from './drafts.js';
import { DRAFT_MSG, liveCount, publicDraft, sanitizeDraftOps } from './draftRules.js';
import { isStage } from './stages.js';
import { MAX_PENDING_RECUT, recutRefusal } from './recutRules.js';
import { earlierRoundFilter, roundFilter, roundOf } from './reopenRules.js';
import { pickPrimary } from './fixesExport.js';
import { pageSig } from './adminReview.js';
import { pendingRecutCount } from './recutRequests.js';

// הטיוטה בשרת (docs/63 §2) — הצד שכותב למסד. הכללים הטהורים — draftRules.js; הראוטים —
// api/page-proof/pages/[id] (הקריאה, עם העמוד) ו-api/page-proof/pages/[id]/draft (השמירה).
//
// • מי כותב: רק מי שמחזיק עכשיו בעמוד (פתוח, התפיסה שלו ובתוקף, לא הגיש) — בגרסה הנוכחית של העמוד. גרסה אחרת ← 409
//   (העמוד הוחלף, חזר מזיהוי-מחדש); לא מחזיק ← 403. השמירה מוחקת את ההודעה "הטיוטה עברה לגרסה החדשה" (carried).
// • שתי לשוניות / שני מחשבים: הדפדפן שולח baseUpdatedAt — מתי נשמרה הטיוטה בשרת כפי שהוא ראה אותה לאחרונה (null =
//   לא ראה טיוטה). הטיוטה השתנתה מאז ← 409 'stale' ושום דבר לא נכתב; הדפדפן טוען מחדש. בלי השדה (לקוח ישן) — בלי בדיקה.
// • חתימת-העמוד (sig — textModel.docRevision): עדכון-עמוד מתוכנת-הספר בלי מספר-גרסה חדש מחליף מזהי-שורות; טיוטה
//   שנכתבה מול חתימה אחרת עוברת בפתיחה הבאה לעמוד כפי שהוא (מה שעדיין תקף נשאר, השאר נרשם ב-carried).
// • מי קורא: המחזיק (בפתיחה לעריכה) ומנהל (לקריאה בלבד).
// • עמוד שעבר למתנדב אחר (התפיסה פגה, מנהל שחרר): הטיוטה נשארת עם העמוד; בפתיחה הראשונה של המחזיק החדש היא עוברת
//   אליו — מה שהקודם עשה נשמר כ-inherited (מסומן בעורך, "ממשיכים מהעבודה של מתנדב קודם").
// • גרסה חדשה של העמוד (חזר מזיהוי-מחדש): בפתיחה הראשונה הטיוטה עוברת אליה באותו כלל של הדפדפן (drafts.carryDraftOps —
//   בלי פעולות-החיתוך, שכבר נעשו, ובלי מה שאינו חל על השורות החדשות), והשלב — "טקסט".
// • הגשה מוחקת את הטיוטה (dropDraft); דחייה אינה מחזירה אותה.
// • הבודק השני (docs/63 §4): מי שפותח עמוד שיש לו הגשה של מתנדב אחר (בגרסה הנוכחית) ואין לו טיוטה — מקבל כטיוטה
//   התחלתית את הפעולות של ההגשה הקודמת (startDraft), מסומנות (inherited, basedOn). ההגשה שלו נרשמת "מבוססת על" ההגשה
//   ההיא (draftBasis ← ראוט ההגשה).
// • עמוד שמנהל פתח מחדש אחרי אישור (docs/63 §5, reopenRules.js): מי שתופס אותו מתחיל מהגרסה שאושרה (ההגשה הראשית של
//   הסבב הקודם), מסומנת — כמו הבודק השני.

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error, code = null) => ({ ok: false, status, error, ...(code ? { code } : {}) });
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const live = (ops) => (Array.isArray(ops) ? ops.filter((o) => o && typeof o === 'object' && !o._local) : []);

// מחזיק בעמוד עכשיו: פתוח, התפיסה שלו ובתוקף, והוא לא הגיש אותו
export function isHolder(page, userId, now = new Date()) {
  if (!page || page.status !== 'open' || !sameId(page.leasedBy, userId)) return false;
  const t = page.leasedUntil ? new Date(page.leasedUntil).getTime() : NaN;
  if (!Number.isFinite(t) || t <= now.getTime()) return false;
  return !(page.submitters || []).some((s) => sameId(s, userId));
}

const PAGE_FIELDS = { doc: 1, gid: 1, page: 1, revision: 1, status: 1, leasedBy: 1, leasedUntil: 1, submitters: 1 };

// PUT: שמירת הטיוטה של המחזיק. body: {revision, ops, stage?, reset?, baseUpdatedAt?} — reset ("התחל מאפס") מוחק גם את
// מה שהתקבל ממישהו אחר (inherited) ואת סימון הזיהוי-מחדש. ← {ok, updatedAt, count, dropped, stage} או
// {ok:false, status, error, code} — 409 'stale' כשהטיוטה בשרת השתנתה מאז baseUpdatedAt
export async function saveDraft(pageId, userId, { revision, ops, stage, reset = false, baseUpdatedAt } = {}, userName = '', now = new Date()) {
  const uid = oid(userId);
  const pid = oid(pageId);
  const page = await PageProofPage.findById(pid, PAGE_FIELDS).lean();
  if (!page) return fail(404, DRAFT_MSG.missing);
  const rev = storedRevision(page);
  if (!Number.isInteger(revision) || !sameRevision(revision, rev)) return fail(409, DRAFT_MSG.reload, 'reload');
  if (!isHolder(page, uid, now)) return fail(403, DRAFT_MSG.notHolder, 'not_holder');
  const clean = sanitizeDraftOps(page.doc, ops);
  if (clean.error) return fail(400, clean.error);
  const set = {
    gid: page.gid,
    pageNo: page.page,
    revision: rev,
    ops: clean.ops,
    opCount: liveCount(clean.ops),
    by: uid,
    byName: String(userName || '').slice(0, 200),
    sig: pageSig(page),
    carried: null,
  };
  if (isStage(stage)) set.stage = stage;
  if (reset) Object.assign(set, { inherited: null, recut: null, stage: isStage(stage) ? stage : 'structure' });
  let d;
  if (baseUpdatedAt === undefined) {
    d = await PageProofDraft.findOneAndUpdate({ page: pid }, { $set: set }, { upsert: true, returnDocument: 'after', lean: true });
  } else if (baseUpdatedAt === null) {
    // הדפדפן לא ראה טיוטה בשרת — יוצרים; אם בינתיים נוצרה (לשונית אחרת, מחשב אחר) — stale
    try {
      d = (await PageProofDraft.create({ page: pid, ...set })).toObject();
    } catch (e) {
      if (e?.code === 11000) return fail(409, DRAFT_MSG.stale, 'stale');
      throw e;
    }
  } else {
    const t = new Date(baseUpdatedAt);
    if (!Number.isFinite(t.getTime())) return fail(409, DRAFT_MSG.stale, 'stale');
    d = await PageProofDraft.findOneAndUpdate({ page: pid, updatedAt: t }, { $set: set }, { returnDocument: 'after', lean: true });
    if (!d) return fail(409, DRAFT_MSG.stale, 'stale');
  }
  return { ok: true, updatedAt: d.updatedAt, count: set.opCount, dropped: clean.dropped, stage: isStage(d.stage) ? d.stage : null };
}

// הטיוטה עוברת לגרסה החדשה של העמוד (חזר מזיהוי-מחדש) — אותו כלל של הדפדפן (carryDraftOps). מותנה בגרסה ובחתימה
// שנקראו. sameRev — אותו מספר-גרסה וחתימה אחרת (עדכון-עמוד מתוכנת-הספר, מזהים אחרים): אותו מעבר, בלי "חזר
// מזיהוי-מחדש" — השלב וסימון הזיהוי-מחדש נשארים.
async function carryToRevision(d, page, now, { sameRev = false } = {}) {
  const rev = storedRevision(page);
  const c = carryDraftOps(page.doc, d.ops);
  const inh = d.inherited && typeof d.inherited === 'object' ? d.inherited : null;
  const set = {
    revision: rev,
    sig: pageSig(page),
    ops: c.kept,
    opCount: liveCount(c.kept),
    carried: { from: d.revision || 1, kept: liveCount(c.kept), cut: c.cut, dropped: c.dropped.map(droppedOpLabel), ...(sameRev ? { update: true } : {}) },
    inherited: inh ? { ...inh, ops: carryDraftOps(page.doc, inh.ops || []).kept } : null,
  };
  if (!sameRev) Object.assign(set, { stage: 'text', recut: { ...(d.recut && typeof d.recut === 'object' ? d.recut : {}), backAt: now } });
  const r = await PageProofDraft.findOneAndUpdate({ _id: d._id, revision: d.revision, ...(d.sig ? { sig: d.sig } : {}) }, { $set: set }, { returnDocument: 'after', lean: true });
  return r || PageProofDraft.findById(d._id).lean();
}

// העמוד עבר למחזיק חדש: הטיוטה שלו מעכשיו, ומה שהקודם עשה — inherited (מסומן בעורך). "מבוססת על הגשה" (basedOn)
// של הקודם נשמרת — כך גם בודק שני שהתפיסה שלו פגה מעביר הלאה את ההגשה שעליה התבסס. טיוטה ריקה — בלי inherited.
async function handOver(d, uid, userName) {
  const ops = live(d.ops);
  const prev = d.inherited && typeof d.inherited === 'object' ? d.inherited : null;
  const inherited = ops.length
    ? { source: 'draft', byName: d.byName || '', at: d.updatedAt || null, ops, basedOn: prev?.basedOn || null }
    : null;
  const r = await PageProofDraft.findOneAndUpdate(
    { _id: d._id, by: d.by },
    { $set: { by: uid, byName: String(userName || '').slice(0, 200), inherited } },
    { returnDocument: 'after', lean: true }
  );
  return r;
}

// ההגשה שממנה מתחילה טיוטה חדשה, או null ← {sub, kind}:
//   'submission' — הבודק השני: ההגשה הפעילה האחרונה של מתנדב אחר בגרסה ובסבב הנוכחיים;
//   'approved'   — עמוד שנפתח מחדש (סבב > 0, עוד בלי הגשה): ההגשה הראשית שאושרה בסבב הקודם (pickPrimary — אותו כלל של
//                  קובץ-התיקונים), גם אם הגיש אותה אותו מתנדב
async function startingPoint(page, uid) {
  const rev = storedRevision(page);
  const round = roundOf(page);
  if ((page.activeCount || 0) > 0) {
    const sub = await PageProofSubmission.findOne(
      { page: page._id, status: { $in: ['submitted', 'approved'] }, recutRequest: { $ne: true }, user: { $ne: uid }, ...revisionFilter(rev), ...roundFilter(round) },
      { ops: 1, user: 1, userName: 1, createdAt: 1 }
    )
      .sort({ createdAt: -1 })
      .lean();
    return sub ? { sub, kind: 'submission' } : null;
  }
  if (round > 0) {
    const subs = await PageProofSubmission.find(
      { page: page._id, status: 'approved', recutRequest: { $ne: true }, ...revisionFilter(rev), ...earlierRoundFilter(round) },
      { ops: 1, user: 1, userName: 1, createdAt: 1, reviewedAt: 1, exportedAt: 1, needsRecut: 1, round: 1, basedOn: 1 }
    ).lean();
    const sub = pickPrimary(subs.map((x) => ({ ...x, approvedAt: x.reviewedAt })));
    return sub ? { sub, kind: 'approved' } : null;
  }
  return null;
}

// טיוטה התחלתית מהגשה קודמת (הבודק השני): הפעולות שלה — מה שעדיין תקף מול העמוד — מסומנות (inherited) ונרשמת ההגשה
// שעליה היא מבוססת (basedOn). השלב — "מבנה", כמו עמוד חדש (רק נקודת-ההתחלה שונה). בלי מה להתחיל ממנו — null.
async function startDraft(page, uid, userName) {
  const from = await startingPoint(page, uid);
  if (!from) return null;
  const { ops } = sanitizeDraftOps(page.doc, from.sub.ops || []);
  if (!liveCount(ops)) return null;
  const byName = from.sub.userName || '';
  const doc = {
    page: page._id,
    gid: page.gid,
    pageNo: page.page,
    revision: storedRevision(page),
    sig: pageSig(page),
    ops,
    opCount: liveCount(ops),
    stage: 'structure',
    by: uid,
    byName: String(userName || '').slice(0, 200),
    inherited: { source: from.kind, byName, at: from.sub.createdAt || null, ops, basedOn: { id: from.sub._id, byName, kind: from.kind } },
    carried: null,
    recut: null,
  };
  // אטומי: אם בינתיים נוצרה טיוטה (פתיחה כפולה) — היא נשארת
  return PageProofDraft.findOneAndUpdate({ page: page._id }, { $setOnInsert: doc }, { upsert: true, returnDocument: 'after', lean: true });
}

// הטיוטה לעורך (GET /api/page-proof/pages/[id]). edit — המחזיק פותח לעריכה: הטיוטה עוברת לגרסה הנוכחית אם צריך,
// ואליו אם הייתה של מתנדב אחר (handover); אין טיוטה ולעמוד יש הגשה של מתנדב אחר — טיוטה התחלתית ממנה (startDraft).
// בלי edit — קריאה בלבד (מנהל), כמות-שהיא. ← publicDraft + {handover, started} או null
export async function editorDraft(page, userId, { edit = false, admin = false, userName = '', now = new Date() } = {}) {
  if (!page?._id) return null;
  const uid = oid(userId);
  let d = await PageProofDraft.findOne({ page: page._id }).lean();
  if (!edit) return d ? { ...publicDraft(d, uid, { admin }), handover: false } : null;
  let handover = false;
  if (d && !sameRevision(d.revision, storedRevision(page))) d = await carryToRevision(d, page, now);
  else if (d && d.sig && d.sig !== pageSig(page)) d = await carryToRevision(d, page, now, { sameRev: true });
  if (d && !sameId(d.by, uid)) {
    const h = await handOver(d, uid, userName);
    if (h) {
      handover = !!h.inherited;
      d = h;
    } else d = await PageProofDraft.findById(d._id).lean();
  }
  let started = false;
  if (!d) {
    d = await startDraft(page, uid, userName);
    started = !!d && sameId(d.by, uid) && !!d.inherited;
  }
  if (!d) return null;
  return { ...publicDraft(d, uid, { admin }), handover, started };
}

// ראוט ההגשה: על מה ההגשה מבוססת — מהטיוטה של המגיש (inherited.basedOn): {basedOn, basedOnName, basedOnKind} או {}
export async function draftBasis(pageId, userId) {
  const d = await PageProofDraft.findOne({ page: oid(pageId), by: oid(userId) }, { inherited: 1 }).lean();
  const b = d?.inherited?.basedOn;
  if (!b?.id || !mongoose.Types.ObjectId.isValid(String(b.id))) return {};
  return { basedOn: oid(b.id), basedOnName: String(b.byName || ''), basedOnKind: b.kind === 'approved' ? 'approved' : 'submission' };
}

// מה שהעורך מקבל עם העמוד (GET /api/page-proof/pages/[id]), מעבר לעמוד עצמו:
//   draft    — הטיוטה (editorDraft): למחזיק בעריכה; למנהל — לקריאה; לכל אחר — null (טיוטה של מתנדב אחר אינה נחשפת)
//   canRecut — עמוד עם שינוי-חיתוך יכול להישלח עכשיו לזיהוי-מחדש בלי מנהל (מתג המנהל דולק — recutOn —, הכללים של
//              recutRules.recutRefusal, ותקרת הבקשות הממתינות למתנדב) — אחרת "המבנה נכון" ממשיך לשלב הטקסט
export async function editorContext(page, userId, { edit = false, admin = false, userName = '', recutOn = false, now = new Date() } = {}) {
  const draft = edit || admin ? await editorDraft(page, userId, { edit, admin, userName, now }) : null;
  let canRecut = false;
  if (edit && recutOn && !recutRefusal(page, userId, now)) canRecut = (await pendingRecutCount(userId)) < MAX_PENDING_RECUT;
  return { draft, canRecut };
}

// הגשה: הטיוטה כבר אינה נחוצה
export async function dropDraft(pageId) {
  const r = await PageProofDraft.deleteOne({ page: oid(pageId) });
  return r.deletedCount || 0;
}

// "המבנה נכון" עם שינוי-חיתוך ← העמוד נשלח לזיהוי-מחדש (recutRequests.requestRecut): כשיחזור — שלב "טקסט"
export async function markRecutSent(pageId, userId, now = new Date()) {
  const r = await PageProofDraft.updateOne({ page: oid(pageId), by: oid(userId) }, { $set: { stage: 'text', recut: { sentAt: now } } });
  return r.modifiedCount || 0;
}
