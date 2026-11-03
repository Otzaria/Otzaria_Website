// צורת הדף — המסלול המהיר בצד השרת: דגימת פריט, הוספת תשובה אטומית, הסכמה ונקודות, סימון "החיתוך לא מראה",
// תרגול, והכרעות המנהל. ייבוא יחסי (node:test). תוצאות: {ok:true, ...} או {ok:false, status, error, code}.
//
// נקודות: +1 לכל מי שענה את ההכרעה המוסכמת, פעם אחת לפריט — pointsAwarded מתהפך באותו עדכון מותנה שסוגר
// את הפריט (agreed/resolved), ורק אחריו $inc. עדכון סטטוס נשען על מספר התשובות שנקרא ($size) — תשובה שנוספה
// בינתיים מכשילה אותו, ואז קוראים שוב ומחשבים מחדש.

import mongoose from 'mongoose';
import TzuratItem from '../../models/TzuratItem.js';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratBatch from '../../models/TzuratBatch.js';
import User from '../../models/User.js';
import { consensus, normalizeText, isVerdict } from './consensus.js';
import { choiceToVerdict, verdictToChoice, CHOICES } from './questions.js';
import { fastItemShape } from './shapes.js';
import { whoOf, isObjectId, cleanText } from './common.js';

export const ITEM_LEASE_MS = 10 * 60 * 1000;
export const TOP_N = 20;
export const MAX_EXCLUDE = 30;
export const POINTS_AGREED = 1;
export const PRACTICE_SIZE = 10;
const RETRIES = 4;

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error, code) => ({ ok: false, status, error, ...(code ? { code } : {}) });

const MSG = {
  notFound: 'השאלה לא נמצאה',
  closed: 'השאלה כבר הוכרעה — עוברים לבאה',
  answered: 'כבר עניתם על השאלה הזו',
  paused: 'המסכת מושהית כרגע',
  flagged: 'כבר סימנתם את השאלה הזו',
  practiceShort: 'יש לענות על כל שאלות התרגול',
};

/** ?exclude=id,id ← ObjectIds תקינים (עד MAX_EXCLUDE) */
export function parseExclude(raw) {
  const out = [];
  for (const s of String(raw || '').split(',')) {
    const id = s.trim();
    if (isObjectId(id)) out.push(oid(id));
    if (out.length >= MAX_EXCLUDE) break;
  }
  return out;
}

/** kind מהכתובת ← מסנן Mongo */
export function kindFilter(kind) {
  if (kind === 'g' || kind === 'r' || kind === 't') return { kind };
  return {};
}

export async function pausedSlugs() {
  const rows = await TzuratBatch.find({ status: 'paused' }, { slug: 1 }).lean();
  return rows.map((b) => b.slug);
}

// כל התנאים שפריט צריך כדי להיות מוצע למשתמש (בלי ההחזקה)
function queueFilter(uid, { exclude, kf, paused }) {
  return {
    status: 'open',
    practice: { $ne: true },
    box: { $ne: null },
    'answers.user': { $ne: uid },
    'flags.user': { $ne: uid },
    ...(exclude.length ? { _id: { $nin: exclude } } : {}),
    ...(paused.length ? { slug: { $nin: paused } } : {}),
    ...kf,
  };
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * פריט אחד למשתמש: פתוח, לא ענה עליו, לא מוחזק אצל אחר (החזקה רכה של 10 דקות), לפי kind המותר.
 * גמרא קודם (כש-kind=any), אחר כך score יורד — בחירה אקראית מבין TOP_N הראשונים. ← מסמך הפריט או null.
 */
export async function sampleFastItem(userId, { exclude = [], kind = 'any', now = new Date() } = {}) {
  const uid = oid(userId);
  const kf = kindFilter(kind);
  const paused = await pausedSlugs();
  const base = queueFilter(uid, { exclude, kf, paused });
  const free = { $or: [{ leasedUntil: null }, { leasedUntil: { $lt: now } }, { leasedBy: uid }] };
  const tiers = kind === 'any' ? [{ kind: 'g' }, { kind: { $ne: 'g' } }] : [{}];
  const until = new Date(now.getTime() + ITEM_LEASE_MS);
  for (const tier of tiers) {
    const match = { $and: [base, tier, free] };
    const top = await TzuratItem.find(match, { _id: 1 }).sort({ score: -1, _id: 1 }).limit(TOP_N).lean();
    for (const c of shuffled(top).slice(0, 4)) {
      const doc = await TzuratItem.findOneAndUpdate(
        { $and: [{ _id: c._id }, base, free] },
        { $set: { leasedBy: uid, leasedUntil: until } },
        { returnDocument: 'after', lean: true }
      );
      if (doc) return doc;
    }
  }
  // הכול מוחזק אצל אחרים — פריט מוחזק (בלי לגעת בהחזקה): שתי תשובות במקביל אינן בעיה
  for (const tier of tiers) {
    const top = await TzuratItem.find({ $and: [base, tier] }).sort({ score: -1, _id: 1 }).limit(TOP_N).lean();
    if (top.length) return shuffled(top)[0];
  }
  return null;
}

/** {open, mine, mineAgreed} */
export async function fastStats(userId) {
  const uid = oid(userId);
  const [open, mine, agreedRows] = await Promise.all([
    TzuratItem.countDocuments({ status: 'open', practice: { $ne: true }, box: { $ne: null } }),
    TzuratItem.countDocuments({ 'answers.user': uid, practice: { $ne: true } }),
    TzuratItem.aggregate([
      { $match: { 'answers.user': uid, status: { $in: ['agreed', 'resolved'] } } },
      {
        $project: {
          d: { $ifNull: ['$resolved.verdict', '$decision.verdict'] },
          mine: { $filter: { input: '$answers', cond: { $eq: ['$$this.user', uid] } } },
        },
      },
      { $match: { $expr: { $eq: [{ $arrayElemAt: ['$mine.verdict', 0] }, '$d'] } } },
      { $count: 'n' },
    ]),
  ]);
  return { open, mine, mineAgreed: agreedRows[0]?.n || 0 };
}

// עמוד הפריט (למידות הסריקה ולכתובות התמונה)
export async function pageOfItem(item) {
  if (item.page) {
    const p = await TzuratPage.findById(item.page, { scan: 1, ours: 1, buildId: 1, round: 1, masechet: 1, daf: 1, slug: 1, dafKey: 1 }).lean();
    if (p) return p;
  }
  return TzuratPage.findOne({ slug: item.slug, dafKey: item.dafKey }, { scan: 1, ours: 1, buildId: 1, round: 1, masechet: 1, daf: 1, slug: 1, dafKey: 1 }).lean();
}

export async function fastItemFor(item, userId) {
  const page = await pageOfItem(item);
  return fastItemShape(item, page, userId);
}

export async function award(userIds, points) {
  const ids = [...new Set(userIds.map(String))].filter(isObjectId).map(oid);
  if (!ids.length || !points) return;
  await User.updateMany({ _id: { $in: ids } }, { $inc: { points } });
}

/**
 * אחרי הוספת תשובה: הסטטוס לפי consensus. סוגר את הפריט (agreed/disputed) בעדכון מותנה במספר התשובות
 * שנקרא; agreed — גם מחלק נקודות (פעם אחת). ← {status: 'recorded'|'agreed'|'disputed', agreers}
 */
export async function settle(itemId, doc, now = new Date()) {
  let cur = doc;
  for (let k = 0; k < RETRIES && cur; k++) {
    if (cur.status !== 'open') return { status: cur.status === 'agreed' ? 'agreed' : cur.status === 'disputed' ? 'disputed' : 'recorded', agreers: [] };
    const c = consensus(cur.answers);
    if (c.status === 'open') return { status: 'recorded', agreers: [] };
    const filter = { _id: cur._id, status: 'open', answers: { $size: (cur.answers || []).length } };
    if (c.status === 'agreed') {
      // נסגר גם כשהנקודות כבר חולקו (למשל אחרי החייאה) — אבל מזכה רק אם עוד לא
      const prev = await TzuratItem.findOneAndUpdate(
        filter,
        { $set: { status: 'agreed', decision: { verdict: c.verdict, text: c.text, at: now }, pointsAwarded: true, leasedBy: null, leasedUntil: null } },
        { returnDocument: 'before', lean: true, projection: { pointsAwarded: 1 } }
      );
      if (prev) {
        if (prev.pointsAwarded) return { status: 'agreed', agreers: [] };
        await award(c.agreers, POINTS_AGREED);
        return { status: 'agreed', agreers: c.agreers };
      }
    } else {
      const r = await TzuratItem.updateOne(filter, { $set: { status: 'disputed', leasedBy: null, leasedUntil: null } });
      if (r.modifiedCount) return { status: 'disputed', agreers: [] };
    }
    cur = await TzuratItem.findById(itemId, { answers: 1, status: 1 }).lean();
  }
  return { status: 'recorded', agreers: [] };
}

/**
 * תשובה של משתמש. answer: {verdict, text} (כבר מתורגם), via: 'fast'|'page'.
 * ← {ok:true, status, points} או fail(404/409/403).
 */
export async function addAnswer(itemId, user, { verdict, text = null, via = 'fast', revision, submission = null }, { now = new Date() } = {}) {
  if (!isObjectId(String(itemId))) return fail(404, MSG.notFound);
  if (!isVerdict(verdict)) return fail(400, 'תשובה לא מוכרת');
  const uid = oid(user.id);
  const item = await TzuratItem.findById(itemId, { kind: 1, slug: 1, status: 1, practice: 1, revision: 1, answers: 1 }).lean();
  if (!item || item.practice) return fail(404, MSG.notFound);
  if (submission && (item.answers || []).some((a) => String(a.submission) === String(submission) && String(a.user) === String(uid))) {
    await settle(item._id, item, now);
    return { ok: true, status: 'recorded', points: 0 };
  }
  if (revision !== undefined && revision !== (item.revision ?? 0)) return fail(409, 'השאלה עודכנה — טענו אותה מחדש', 'stale');
  if (await TzuratBatch.exists({ slug: item.slug, status: 'paused' })) return fail(409, MSG.paused, 'paused');
  if ((item.answers || []).some((a) => String(a.user) === String(uid))) return fail(409, MSG.answered, 'answered');
  if (item.status !== 'open') return fail(409, MSG.closed, 'closed');
  const answer = {
    user: uid,
    who: whoOf(uid),
    name: cleanText(user.name, 100),
    verdict,
    // הטקסט כפי שנכתב (רק רווחים מכווצים) — גרשיים, ניקוד וסימנים הם חלק מנוסח הדפוס; normalizeText רק להשוואה
    text: verdict === 'other' ? cleanText(text, 200) || null : null,
    via: via === 'page' ? 'page' : 'fast',
    submission,
    at: now,
  };
  const doc = await TzuratItem.findOneAndUpdate(
    { _id: item._id, status: 'open', practice: { $ne: true }, 'answers.user': { $ne: uid },
      ...(revision !== undefined ? { $or: [{ revision }, ...(revision === 0 ? [{ revision: { $exists: false } }] : [])] } : {}) },
    { $push: { answers: answer }, $set: { leasedBy: null, leasedUntil: null } },
    { returnDocument: 'after', lean: true, projection: { answers: 1, status: 1 } }
  );
  if (!doc) {
    const now2 = await TzuratItem.findById(item._id, { status: 1, revision: 1, 'answers.user': 1 }).lean();
    if (revision !== undefined && revision !== (now2?.revision ?? 0)) return fail(409, 'השאלה עודכנה — טענו אותה מחדש', 'stale');
    if ((now2?.answers || []).some((a) => String(a.user) === String(uid))) return fail(409, MSG.answered, 'answered');
    return fail(409, MSG.closed, 'closed');
  }
  const s = await settle(item._id, doc, now);
  return { ok: true, status: s.status, points: s.agreers.includes(String(uid)) ? POINTS_AGREED : 0 };
}

/** תשובה מהמסלול המהיר: choice (מזהה האפשרות שהוצגה) ← verdict, ואז addAnswer */
export async function answerChoice(itemId, user, { choice, text, via = 'fast', revision }, opts = {}) {
  if (!CHOICES.includes(choice)) return fail(400, 'תשובה לא מוכרת');
  if (!isObjectId(String(itemId))) return fail(404, MSG.notFound);
  const item = await TzuratItem.findById(itemId, { question: 1, otz: 1, print: 1, n: 1, cls: 1, practice: 1, revision: 1 }).lean();
  if (!item || item.practice) return fail(404, MSG.notFound);
  if (revision !== (item.revision ?? 0)) return fail(409, 'השאלה עודכנה — טענו אותה מחדש', 'stale');
  const v = choiceToVerdict(item, user.id, choice, text);
  if (v.error) return fail(400, v.error);
  return addAnswer(itemId, user, { verdict: v.verdict, text: v.text, via, revision }, opts);
}

export const FLAGS_TO_CLOSE = 2;

/**
 * "החיתוך לא מראה את המקום". רך: הסימון נרשם (משתמש אחד פעם אחת, והשאלה לא תוצע לו שוב), והפריט עובר
 * לבדיקת מנהל (flagged) רק אחרי FLAGS_TO_CLOSE משתמשים שונים. ← {ok:true, flagged}
 */
export async function flagItem(itemId, userId, reason, { now = new Date() } = {}) {
  if (!isObjectId(String(itemId))) return fail(404, MSG.notFound);
  const uid = oid(userId);
  const item = await TzuratItem.findById(itemId, { kind: 1, slug: 1, status: 1, practice: 1, 'flags.user': 1 }).lean();
  if (!item || item.practice) return fail(404, MSG.notFound);
  if (await TzuratBatch.exists({ slug: item.slug, status: 'paused' })) return fail(409, MSG.paused, 'paused');
  const entry = { user: uid, reason: cleanText(reason, 200), at: now };
  const doc = await TzuratItem.findOneAndUpdate(
    { _id: item._id, status: 'open', practice: { $ne: true }, 'flags.user': { $ne: uid } },
    { $push: { flags: entry }, $set: { leasedBy: null, leasedUntil: null } },
    { returnDocument: 'after', lean: true, projection: { flags: 1 } }
  );
  if (!doc) {
    if ((item.flags || []).some((f) => String(f.user) === String(uid))) return fail(409, MSG.flagged, 'flagged');
    return fail(409, MSG.closed, 'closed');
  }
  if ((doc.flags || []).length >= FLAGS_TO_CLOSE) {
    const r = await TzuratItem.updateOne(
      { _id: item._id, status: 'open' },
      { $set: { status: 'flagged', flag: { reason: entry.reason, by: uid, at: now } } }
    );
    return { ok: true, flagged: r.modifiedCount > 0 };
  }
  return { ok: true, flagged: false };
}

// ---------- תרגול ----------

/** עד PRACTICE_SIZE פריטי תרגול (FastItem + explain) */
const PRACTICE_MATCH = Object.freeze({ practice: true });

export async function practiceItems(userId) {
  const rows = await TzuratItem.aggregate([{ $match: PRACTICE_MATCH }, { $sample: { size: PRACTICE_SIZE } }]);
  const out = [];
  for (const it of rows) out.push({ ...(await fastItemFor(it, userId)), explain: it.explain || '' });
  return out;
}

/**
 * answers: [{id, choice, text?}] ← {ok, score, total, results:[{id, correct, expected, explain}]}; מסמן practiceDone.
 * נדרשות תשובות ל-min(PRACTICE_SIZE, הזמינות) שאלות תרגול שונות — אחרת 400 בלי לסמן.
 */
export async function gradePractice(userId, answers) {
  const list = (Array.isArray(answers) ? answers : []).filter((a) => a && isObjectId(String(a.id))).slice(0, 50);
  const ids = list.map((a) => oid(a.id));
  const items = await TzuratItem.find({ _id: { $in: ids }, practice: true }).lean();
  const byId = new Map(items.map((it) => [String(it._id), it]));
  const results = [];
  for (const a of list) {
    const it = byId.get(String(a.id));
    if (!it) continue;
    const v = CHOICES.includes(a.choice) ? choiceToVerdict(it, userId, a.choice, a.text) : { error: 'x' };
    const correct = !v.error && v.verdict === it.expected && (it.expected !== 'other' || normalizeText(v.text) === normalizeText(it.expectedText));
    results.push({ id: String(it._id), correct, expected: verdictToChoice(it, userId, it.expected), explain: it.explain || '' });
  }
  const need = Math.min(PRACTICE_SIZE, await TzuratItem.countDocuments(PRACTICE_MATCH));
  if (new Set(results.map((r) => r.id)).size < need) return fail(400, MSG.practiceShort, 'practice_short');
  await User.updateOne({ _id: oid(userId) }, { $set: { tzuratPracticeDone: true } });
  return { ok: true, score: results.filter((r) => r.correct).length, total: results.length, results };
}

// ---------- מנהל ----------

const RESOLVE_VERDICTS = ['print', 'otz', 'other', 'elsewhere'];

/**
 * פעולת מנהל על פריט: resolve {verdict, text} | reopen | unflag | obsolete. ← {ok, item} או fail.
 * resolve מזכה (פעם אחת) את מי שענה כמו ההכרעה, אם הנקודות עוד לא חולקו.
 */
export async function adminItemAction(itemId, body, admin, now = new Date()) {
  if (!isObjectId(String(itemId))) return fail(404, MSG.notFound);
  const id = oid(itemId);
  const action = body?.action;
  if (action === 'resolve') {
    if (!RESOLVE_VERDICTS.includes(body.verdict)) return fail(400, 'הכרעה לא תקינה');
    const text = body.verdict === 'other' ? cleanText(body.text, 200) : null;
    if (body.verdict === 'other' && !text) return fail(400, 'יש לכתוב את הנוסח שנדפס');
    const resolved = { verdict: body.verdict, text, by: isObjectId(String(admin?.id)) ? oid(admin.id) : null, byName: cleanText(admin?.name, 100), at: now };
    const prev = await TzuratItem.findOneAndUpdate(
      { _id: id, practice: { $ne: true }, status: { $ne: 'obsolete' } },
      { $set: { status: 'resolved', resolved, pointsAwarded: true, leasedBy: null, leasedUntil: null } },
      { returnDocument: 'before', lean: true }
    );
    if (!prev) return (await TzuratItem.exists({ _id: id })) ? fail(409, 'אי אפשר להכריע בפריט הזה') : fail(404, MSG.notFound);
    if (!prev.pointsAwarded) {
      const right = (prev.answers || []).filter((a) => a.verdict === body.verdict && (body.verdict !== 'other' || normalizeText(a.text) === normalizeText(text)));
      await award(right.map((a) => a.user), POINTS_AGREED);
    }
  } else if (action === 'reopen') {
    // חוזר לשאלה פתוחה ונקייה (אחרת שתי התשובות הקודמות היו סוגרות אותה מיד שוב). נקודות שכבר חולקו נשארות;
    // ההסכמה הבאה מזכה מחדש
    const r = await TzuratItem.updateOne(
      { _id: id, practice: { $ne: true } },
      { $set: { status: 'open', answers: [], decision: null, resolved: null, flag: null, flags: [], pointsAwarded: false, leasedBy: null, leasedUntil: null } }
    );
    if (!r.matchedCount) return fail(404, MSG.notFound);
  } else if (action === 'unflag') {
    const r = await TzuratItem.updateOne({ _id: id, status: 'flagged' }, { $set: { status: 'open', flag: null, flags: [] } });
    if (!r.matchedCount) return (await TzuratItem.exists({ _id: id })) ? fail(409, 'הפריט אינו מסומן') : fail(404, MSG.notFound);
  } else if (action === 'obsolete') {
    const r = await TzuratItem.updateOne({ _id: id }, { $set: { status: 'obsolete', leasedBy: null, leasedUntil: null } });
    if (!r.matchedCount) return fail(404, MSG.notFound);
  } else {
    return fail(400, 'פעולה לא מוכרת');
  }
  const item = await TzuratItem.findById(id).lean();
  return { ok: true, item };
}

// יש בכלל פריטי תרגול? (בלעדיהם אין טעם לחסום את המסלול המהיר בתרגול)
export async function hasPractice() {
  return !!(await TzuratItem.exists({ practice: true }));
}
