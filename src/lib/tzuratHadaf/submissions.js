// צורת הדף — הגשת בדיקת עמוד ואישור/דחייה בידי מנהל. ייבוא יחסי (node:test).
//
// הגשה: כל הקלט נבדק קודם; אחר כך תפיסת מקום אטומית (כמו בהגהת העמודים: activeCount+1, submitters+uid,
// רק אם העמוד פתוח, באותו סבב, המשתמש לא הגיש, יש מקום פנוי, והוא המחזיק או שהעמוד פנוי); יצירת ההגשה — ואם
// נכשלה, ביטול תפיסת המקום. אחר כך: תשובות לפריטים (via 'page', אותה הסכמה ונקודות), פריטים ידניים
// ("בדפוס כתוב אחרת"), דיווחים, ומחיקת הטיוטה.
// אישור: +10 נקודות למגיש (פעם אחת), approvedCount+1, והעמוד done כשהמאושרות ≥ required.
// דחייה: המקום מתפנה (activeCount-1, המגיש יוצא מ-submitters) — העמוד חוזר למאגר, גם למגיש עצמו.

import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratItem from '../../models/TzuratItem.js';
import TzuratSubmission from '../../models/TzuratSubmission.js';
import TzuratReport from '../../models/TzuratReport.js';
import User from '../../models/User.js';
import { normalizeLineOps, applyLineOps, deriveAnchors, flattenBlock } from './lineOps.js';
import { normalizeChecks, normalizeReport, MAX_REPORTS_PER_SUBMISSION } from './reportRules.js';
import { addAnswer, settle, POINTS_AGREED } from './items.js';
import { dropDraft } from './pages.js';
import { reviewVersion } from './shapes.js';
import { CHOICES, choiceToVerdict } from './questions.js';
import { normalizeText, consensus } from './consensus.js';
import { whoOf, isObj, isObjectId, cleanText, cleanMultiline, words, fracBox } from './common.js';

export const POINTS_APPROVED = 10;
export const MAX_ITEM_ANSWERS = 500;
export const MAX_MANUAL = 100;
export const MAX_NOTE = 1000;
const CTX = 3;

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error, code) => ({ ok: false, status, error, ...(code ? { code } : {}) });

async function applyPointEvent(userId, event, points) {
  await User.updateOne(
    { _id: userId },
    [{
      $set: {
        points: {
          $cond: [
            { $in: [event, { $ifNull: ['$tzuratPointEvents', []] }] },
            { $ifNull: ['$points', 0] },
            { $add: [{ $ifNull: ['$points', 0] }, points] },
          ],
        },
        tzuratPointEvents: { $setUnion: [{ $ifNull: ['$tzuratPointEvents', []] }, [event]] },
      },
    }],
    { updatePipeline: true }
  );
}

// ---------- בדיקת הקלט ----------

function normalizeItemAnswers(raw) {
  if (raw == null) return { list: [] };
  if (!Array.isArray(raw) || raw.length > MAX_ITEM_ANSWERS) return { error: 'רשימת התשובות אינה תקינה' };
  const list = [];
  const seen = new Set();
  for (const a of raw) {
    if (!isObj(a) || !isObjectId(String(a.item)) || typeof a.choice !== 'string') return { error: 'תשובה לפריט אינה תקינה' };
    if (seen.has(String(a.item))) continue;
    seen.add(String(a.item));
    list.push({ item: String(a.item), choice: a.choice, revision: a.revision, text: typeof a.text === 'string' ? a.text : null });
  }
  return { list };
}

/** "בדפוס כתוב אחרת": [{block, line, ref, wi, n, otz, text, box}] מול מודל העמוד ← {list} או {error} */
export function normalizeManualItems(raw, model) {
  if (raw == null) return { list: [] };
  if (!Array.isArray(raw) || raw.length > MAX_MANUAL) return { error: 'רשימת התיקונים הידניים אינה תקינה' };
  const blocks = new Map((model?.blocks || []).map((b) => [b.id, b]));
  const list = [];
  for (const m of raw) {
    if (!isObj(m)) return { error: 'תיקון ידני לא תקין' };
    const block = blocks.get(m.block);
    if (!block) return { error: 'תיקון ידני בגוש שאינו בעמוד' };
    if (typeof m.ref !== 'string' || !m.ref || m.ref.length > 300 || !Number.isInteger(m.wi) || m.wi < 0) {
      return { error: 'תיקון ידני בלי מילה תקינה' };
    }
    const otz = words(m.otz, 30);
    if (!otz.length) return { error: 'תיקון ידני בלי המילים שסומנו' };
    const text = cleanText(m.text, 201);
    if (!text) return { error: 'תיקון ידני בלי הנוסח שנדפס' };
    if (text.length > 200) return { error: 'הנוסח בתיקון ידני ארוך מדי (עד 200 תווים)' };
    if (m.box != null && !fracBox(m.box)) return { error: 'מיקום לא תקין בתיקון ידני' };
    // ההקשר — מהמילים של הגוש במודל
    const { words: flat } = flattenBlock(block);
    const j = flat.findIndex((w) => w?.ref === m.ref && w?.wi === m.wi);
    if (j < 0) return { error: 'המילה שסומנה אינה בגוש' };
    const n = otz.length;
    list.push({
      block: block.id,
      kind: block.kind || block.id,
      line: Number.isInteger(m.line) ? m.line : null,
      ref: m.ref,
      wi: m.wi,
      n,
      otz,
      text,
      print: text.split(/\s+/).filter(Boolean),
      box: fracBox(m.box),
      ctxBefore: flat.slice(Math.max(0, j - CTX), j).map((w) => w.t).filter((t) => typeof t === 'string'),
      ctxAfter: flat.slice(j + n, j + n + CTX).map((w) => w.t).filter((t) => typeof t === 'string'),
    });
  }
  return { list };
}

/** כל גוף ההגשה ← {value} או {error} */
export function normalizeSubmission(body, model) {
  if (!isObj(body)) return { error: 'גוף הבקשה חסר' };
  const checks = normalizeChecks(body.checks);
  if (checks.error) return { error: checks.error };
  const ops = normalizeLineOps(body.lineOps);
  if (ops.error) return { error: ops.error };
  const answers = normalizeItemAnswers(body.itemAnswers);
  if (answers.error) return { error: answers.error };
  const manual = normalizeManualItems(body.manualItems, model);
  if (manual.error) return { error: manual.error };
  const reportsRaw = body.reports == null ? [] : body.reports;
  if (!Array.isArray(reportsRaw) || reportsRaw.length > MAX_REPORTS_PER_SUBMISSION) return { error: 'רשימת הדיווחים אינה תקינה' };
  const reports = [];
  for (const r of reportsRaw) {
    const v = normalizeReport(r);
    if (v.error) return { error: v.error };
    reports.push(v.report);
  }
  return {
    value: {
      checks: checks.checks,
      ops: ops.ops,
      itemAnswers: answers.list,
      manualItems: manual.list,
      reports,
      note: cleanMultiline(body.note, MAX_NOTE),
      version: body.version,
      round: Number.isInteger(body.round) ? body.round : null,
    },
  };
}

// הפעולות שחלו בפועל על המודל, והעוגנים שנגזרים מהן
export function opsAndAnchors(model, ops) {
  const { applied } = applyLineOps(model, ops);
  return { lineOps: applied, anchors: deriveAnchors(model, applied) };
}

// ---------- פריטים ידניים ----------

// verdict של המציע לפריט קיים עם אותו מפתח: print אם הנוסח שלו הוא print של הפריט, otz אם הוא otz, אחרת other
function verdictForExisting(item, text) {
  const t = normalizeText(text);
  if (t === normalizeText((item.print || []).join(' '))) return { verdict: 'print', text: null };
  if (t === normalizeText((item.otz || []).join(' '))) return { verdict: 'otz', text: null };
  return { verdict: 'other', text: cleanText(text, 200) };
}

async function addManualItem(page, m, user, now, submission) {
  const uid = oid(user.id);
  const sourceKey = `${page.slug}|${m.kind}|${m.ref}|${m.wi}|rep`;
  const answer = { user: uid, who: whoOf(uid), name: cleanText(user.name, 100), verdict: 'print', text: null, via: 'page', at: now, submission };
  const existing = await TzuratItem.findOne({ sourceKey }, { _id: 1, otz: 1, print: 1 }).lean();
  if (!existing) {
    try {
      const doc = await TzuratItem.create({
        sourceKey,
        slug: page.slug,
        masechet: page.masechet,
        daf: page.daf,
        dafKey: page.dafKey,
        page: page._id,
        kind: m.kind,
        cls: 'manual',
        question: 'replace',
        ref: m.ref,
        wi: m.wi,
        n: m.n,
        otz: m.otz,
        print: m.print,
        ctxBefore: m.ctxBefore,
        ctxAfter: m.ctxAfter,
        box: m.box,
        score: 0,
        manual: true,
        answers: [answer],
        buildId: page.buildId,
      });
      return { id: doc._id, result: { ok: true } };
    } catch (e) {
      if (e?.code !== 11000) throw e;
    }
  }
  const item = existing || (await TzuratItem.findOne({ sourceKey }, { _id: 1, otz: 1, print: 1 }).lean());
  if (!item) throw new Error('Manual item disappeared');
  // Only revive manual items retired by rejection, never imported obsolete questions.
  await TzuratItem.updateOne(
    { _id: item._id, manual: true, status: 'obsolete', answers: { $size: 0 } },
    { $set: { status: 'open', decision: null, resolved: null, pointsAwarded: false }, $inc: { revision: 1 } }
  );
  const current = await TzuratItem.findById(item._id).lean();
  const v = verdictForExisting(current, m.text);
  const result = await addAnswer(item._id, user, { ...v, via: 'page', submission, revision: current.revision ?? 0 }, { now });
  return { id: item._id, result };
}

// ---------- הגשה ----------

/**
 * הגשת עמוד. user: {id, name}. ← {ok, submission: id, points: 0} או fail.
 */
export async function submitPage(pageId, user, body, { now = new Date() } = {}) {
  if (!isObjectId(String(pageId))) return fail(404, 'העמוד לא נמצא');
  const uid = oid(user.id);
  const page = await TzuratPage.findById(pageId).lean();
  if (!page) return fail(404, 'העמוד לא נמצא');
  const pending = await TzuratSubmission.findOne({ page: page._id, user: uid, status: 'processing' }).lean();
  if (pending) return finishSubmission(pending, user, { now });
  const v = normalizeSubmission(body, page.model);
  if (v.error) return fail(400, v.error);
  const input = v.value;
  if (input.version !== reviewVersion(page)) return fail(409, 'העמוד עודכן — טענו אותו מחדש', 'stale');
  // Translate and retain the words/version seen by the volunteer before any side effect.
  const candidates = input.itemAnswers.length ? await TzuratItem.find(
    { _id: { $in: input.itemAnswers.map((a) => oid(a.item)) }, page: page._id },
    { question: 1, otz: 1, print: 1, n: 1, cls: 1, practice: 1, revision: 1 }
  ).lean() : [];
  const itemsById = new Map(candidates.map((it) => [String(it._id), it]));
  for (const a of input.itemAnswers) {
    const item = itemsById.get(a.item);
    if (!item || item.practice || !CHOICES.includes(a.choice)) return fail(400, 'שאלה לא תקינה בהגשה');
    if (a.revision !== (item.revision ?? 0)) return fail(409, 'שאלה בעמוד עודכנה — טענו אותו מחדש', 'stale');
    const answer = choiceToVerdict(item, user.id, a.choice, a.text);
    if (answer.error) return fail(400, answer.error);
    a.otz = item.otz;
    a.print = item.print;
    a.verdict = answer.verdict;
    a.text = answer.text;
  }
  if (input.round !== null && input.round !== (page.round || 1)) {
    return fail(409, 'העמוד עודכן מאז שנפתח (בנייה חדשה) — טענו אותו מחדש', 'stale');
  }
  const { lineOps, anchors } = opsAndAnchors(page.model, input.ops);

  let sub;
  try {
    sub = await TzuratSubmission.create({
      page: page._id,
      slug: page.slug,
      dafKey: page.dafKey,
      user: uid,
      who: whoOf(uid),
      userName: cleanText(user.name, 100),
      round: page.round || 1,
      buildId: page.buildId || '',
      checks: input.checks,
      lineOps,
      anchors,
      note: input.note,
      status: 'processing',
      reservationClaimed: false,
      input: { ...input, page: { _id: page._id, slug: page.slug, masechet: page.masechet, daf: page.daf, dafKey: page.dafKey, buildId: page.buildId },
        reports: input.reports.map((r) => ({ ...r, _id: new mongoose.Types.ObjectId() })) },
    });
  } catch (e) {
    if (e?.code === 11000) {
      const existing = await TzuratSubmission.findOne({ page: page._id, user: uid, round: page.round || 1, status: 'processing' }).lean();
      if (existing) return finishSubmission(existing, user, { now });
    }
    throw e;
  }

  const claimed = await TzuratPage.findOneAndUpdate(
    {
      _id: page._id,
      status: 'open',
      round: page.round || 1,
      buildId: page.buildId || '',
      submitters: { $ne: uid },
      $expr: { $lt: ['$activeCount', '$required'] },
      $or: [{ leasedBy: uid }, { leasedUntil: null }, { leasedUntil: { $lt: now } }],
    },
    { $inc: { activeCount: 1 }, $push: { submitters: uid } },
    { returnDocument: 'after', lean: true }
  );
  if (!claimed) {
    await TzuratSubmission.deleteOne({ _id: sub._id, status: 'processing', reservationClaimed: false });
    const p = await TzuratPage.findById(page._id, { status: 1, round: 1, buildId: 1, submitters: 1 }).lean();
    if (p && reviewVersion(p) !== reviewVersion(page)) return fail(409, 'העמוד עודכן מאז שנפתח — טענו אותו מחדש', 'stale');
    if ((p?.submitters || []).some((s) => String(s) === String(uid))) return fail(409, 'כבר הגשתם את העמוד הזה', 'submitted');
    return fail(409, 'העמוד כבר הוגש או נלקח בידי מתנדב אחר', 'taken');
  }

  const marked = await TzuratSubmission.updateOne(
    { _id: sub._id, status: 'processing' },
    { $set: { reservationClaimed: true } }
  );
  if (!marked.matchedCount) throw new Error('Submission disappeared after reservation');
  sub.reservationClaimed = true;

  return finishSubmission(sub.toObject(), user, { now });
}

// The submission is invisible to review/export until every write has succeeded. Each effect is
// idempotent (answers carry the submission ID; report IDs are allocated in the saved input).
const PROCESSING_MS = 10 * 60 * 1000;
async function finishSubmission(sub, user, { now }) {
  if (!sub.reservationClaimed) {
    const uid = oid(user.id);
    const page = sub.input?.page;
    const current = await TzuratPage.findById(sub.page, { round: 1, buildId: 1, submitters: 1 }).lean();
    if (current && (current.round || 1) === (sub.round || 1) && (current.buildId || '') === (sub.buildId || '') &&
        (current.submitters || []).some((id) => String(id) === String(uid))) {
      await TzuratSubmission.updateOne({ _id: sub._id, status: 'processing' }, { $set: { reservationClaimed: true } });
      sub.reservationClaimed = true;
    } else {
      const claimed = await TzuratPage.findOneAndUpdate(
        {
          _id: sub.page, status: 'open', round: sub.round || 1, buildId: sub.buildId || '',
          submitters: { $ne: uid }, $expr: { $lt: ['$activeCount', '$required'] },
          $or: [{ leasedBy: uid }, { leasedUntil: null }, { leasedUntil: { $lt: now } }],
        },
        { $inc: { activeCount: 1 }, $push: { submitters: uid } },
        { returnDocument: 'after', lean: true }
      );
      if (!claimed) {
        await TzuratSubmission.deleteOne({ _id: sub._id, status: 'processing', reservationClaimed: false });
        if (page && current && ((current.round || 1) !== (sub.round || 1) || (current.buildId || '') !== (sub.buildId || ''))) {
          return fail(409, 'העמוד עודכן מאז שנפתח — טענו אותו מחדש', 'stale');
        }
        return fail(409, 'העמוד כבר הוגש או נלקח בידי מתנדב אחר', 'taken');
      }
      await TzuratSubmission.updateOne({ _id: sub._id, status: 'processing' }, { $set: { reservationClaimed: true } });
      sub.reservationClaimed = true;
    }
  }
  const token = randomUUID();
  const lock = { _id: sub._id, status: 'processing', processingToken: token };
  const claimed = await TzuratSubmission.findOneAndUpdate(
    { _id: sub._id, status: 'processing', $or: [{ processingUntil: null }, { processingUntil: { $lt: new Date() } }] },
    { $set: { processingToken: token, processingUntil: new Date(Date.now() + PROCESSING_MS) } },
    { returnDocument: 'after', lean: true }
  );
  if (!claimed) return fail(409, 'ההגשה עדיין נשמרת — נסו שוב בעוד רגע', 'processing');
  const input = claimed.input;
  const page = input.page;
  const uid = oid(user.id);
  const itemAnswers = [], manualIds = [], reportIds = [], answerIssues = [];
  let lastBeat = Date.now();
  const beat = async (force = false) => {
    if (!force && Date.now() - lastBeat < 30000) return;
    const r = await TzuratSubmission.updateOne(lock, { $set: { processingUntil: new Date(Date.now() + PROCESSING_MS) } });
    if (!r.matchedCount) throw new Error('Submission worker superseded');
    lastBeat = Date.now();
  };
  try {
    for (const a of input.itemAnswers) {
      await beat();
      const r = await addAnswer(a.item, user, { verdict: a.verdict, text: a.text, revision: a.revision, via: 'page', submission: sub._id }, { now });
      if (r.ok) itemAnswers.push({ item: oid(a.item), verdict: a.verdict, text: a.text ?? null });
      else {
        const proposed = a.verdict === 'print' ? a.print.join(' ') : a.verdict === 'otz' ? a.otz.join(' ') : a.text || (a.verdict === 'unclear' ? 'לא ברור' : 'נמצא במקום אחר');
        answerIssues.push(`${a.item}: ${r.error} — התשובה שהוצעה: ${proposed}`);
      }
    }
    for (const m of input.manualItems) {
      await beat();
      const { id, result } = await addManualItem(page, m, user, now, sub._id);
      manualIds.push(id);
      if (!result.ok) answerIssues.push(`${m.ref} #${m.wi}: ${result.error} — התיקון שהוצע: ${m.text}`);
    }
    for (const r of input.reports) {
      await beat();
      await TzuratReport.updateOne({ _id: r._id }, { $setOnInsert: {
        page: page._id, slug: page.slug, dafKey: page.dafKey, user: uid,
        who: whoOf(uid), userName: cleanText(user.name, 100), ...r, submission: sub._id,
      } }, { upsert: true });
      reportIds.push(r._id);
    }
    await beat(true);
    const done = await TzuratSubmission.updateOne(lock, { $set: {
      itemAnswers, manualItems: manualIds, reports: reportIds, answerIssues, status: 'submitted', processingToken: null, processingUntil: null,
    } });
    if (!done.matchedCount) throw new Error('Submission worker superseded');
  } catch (e) {
    await TzuratSubmission.updateOne(lock, { $set: { processingToken: null, processingUntil: null } }).catch(() => {});
    console.error('tzurat submit processing', e?.name);
    return fail(503, 'שמירת ההגשה לא הושלמה. העבודה נשמרה — נסו להגיש שוב כדי להמשיך מאותה נקודה', 'retry');
  }
  await TzuratPage.updateOne({ _id: page._id, round: sub.round, leasedBy: uid }, { $set: { leasedBy: null, leasedUntil: null } });
  await dropDraft(page._id, { userId: user.id, version: input.version }).catch((e) => console.error('tzurat submit dropDraft', e?.name));
  return { ok: true, submission: String(sub._id), points: 0, warnings: answerIssues };
}

// ---------- אישור ודחייה ----------

const reviewerOf = (admin, note, now) => ({
  reviewedBy: isObjectId(String(admin?.id)) ? oid(admin.id) : null,
  reviewedByName: cleanText(admin?.name, 100),
  reviewedAt: now,
  reviewNote: cleanMultiline(note, MAX_NOTE),
});

/** אישור. lineOps (אופציונלי) — הפעולות אחרי תיקון המנהל. ← {ok, submission} */
export async function approveSubmission(subId, admin, { note = '', lineOps } = {}, now = new Date()) {
  if (!isObjectId(String(subId))) return fail(404, 'ההגשה לא נמצאה');
  let sub = await TzuratSubmission.findById(subId).lean();
  if (!sub) return fail(404, 'ההגשה לא נמצאה');
  if (sub.status === 'approved' && !sub.reviewAction) return fail(409, 'ההגשה כבר טופלה', 'reviewed');
  if (sub.status !== 'submitted' || (sub.reviewAction && sub.reviewAction !== 'approve')) {
    return fail(409, 'ההגשה כבר טופלה', 'reviewed');
  }
  const set = { ...reviewerOf(admin, note, now) };
  if (lineOps !== undefined) {
    const ops = normalizeLineOps(lineOps);
    if (ops.error) return fail(400, ops.error);
    const page = await TzuratPage.findById(sub.page, { model: 1, round: 1, buildId: 1 }).lean();
    // העוגנים נגזרים מהמודל הנוכחי — רק אם הוא עדיין המודל שההגשה נעשתה מולו
    if (!page || (page.round || 1) !== (sub.round || 1) || (page.buildId || '') !== (sub.buildId || '')) {
      return fail(409, 'העמוד עודכן מאז ההגשה (סבב או בנייה חדשה) — אי אפשר לאשר עם שורות מתוקנות; אשרו בלי תיקון או דחו', 'stale');
    }
    const r = opsAndAnchors(page.model, ops.ops);
    set.lineOps = r.lineOps;
    set.anchors = r.anchors;
    set.reviewerEdited = true;
  }
  if (!sub.reviewAction) {
    const claimed = await TzuratSubmission.findOneAndUpdate(
      { _id: sub._id, status: 'submitted', reviewAction: null },
      { $set: { reviewAction: 'approve', reviewData: { set } } },
      { returnDocument: 'after', lean: true }
    );
    if (!claimed) {
      sub = await TzuratSubmission.findById(sub._id).lean();
      if (sub?.reviewAction !== 'approve') return fail(409, 'ההגשה כבר מטופלת בפעולה אחרת', 'processing');
    } else sub = claimed;
  }
  const frozenSet = sub.reviewData?.set || set;
  await applyPointEvent(sub.user, `submission:${sub._id}:approved`, POINTS_APPROVED);
  await TzuratPage.updateOne(
    { _id: sub.page, round: sub.round || 1 },
    [{
      $set: {
        approvedCount: {
          $cond: [
            { $in: [sub._id, { $ifNull: ['$approvalEvents', []] }] },
            { $ifNull: ['$approvedCount', 0] },
            { $add: [{ $ifNull: ['$approvedCount', 0] }, 1] },
          ],
        },
        approvalEvents: { $setUnion: [{ $ifNull: ['$approvalEvents', []] }, [sub._id]] },
      },
    }],
    { updatePipeline: true }
  );
  await TzuratPage.updateOne(
    { _id: sub.page, round: sub.round || 1, status: 'open', $expr: { $gte: ['$approvedCount', '$required'] } },
    { $set: { status: 'done', leasedBy: null, leasedUntil: null } }
  );
  const done = await TzuratSubmission.updateOne(
    { _id: sub._id, status: 'submitted', reviewAction: 'approve' },
    { $set: { status: 'approved', pointsAwarded: true, ...frozenSet, reviewAction: null, reviewData: null } }
  );
  if (!done.matchedCount) return fail(409, 'ההגשה כבר טופלה', 'reviewed');
  return { ok: true, submission: await TzuratSubmission.findById(sub._id).lean() };
}

/**
 * דחיית הגשה מבטלת את התשובות שנשלחו בה (via 'page'): פריט פתוח — התשובה יוצאת; פריט שהוסכם (או במחלוקת)
 * בזכותה — חוזר לפתוח, הנקודות שחולקו עליו מוחזרות, ונבדק מחדש עם התשובות שנשארו. פריט ידני שנשאר בלי
 * תשובות ← obsolete. הכרעת מנהל (resolved) נשארת.
 */
async function rejectionPlan(sub) {
  const ids = [...new Set([...(sub.itemAnswers || []).map((a) => String(a.item)), ...(sub.manualItems || []).map(String)])];
  const rows = ids.length
    ? await TzuratItem.find({ _id: { $in: ids.map(oid) } }, { status: 1, answers: 1, manual: 1, pointsAwarded: 1 }).lean()
    : [];
  return rows.map((item) => ({
    item: item._id,
    manual: Boolean(item.manual),
    rollbackUsers: item.status === 'agreed' && item.pointsAwarded ? consensus(item.answers).agreers : [],
  }));
}

async function undoPageAnswers(sub, plan, now) {
  for (const step of plan) {
    const item = await TzuratItem.findById(step.item, { status: 1, answers: 1, manual: 1, pointsAwarded: 1 }).lean();
    if (!item) continue;
    const hasAnswer = (item.answers || []).some((a) =>
      String(a.user) === String(sub.user) && a.via === 'page' && (!a.submission || String(a.submission) === String(sub._id))
    );
    if (hasAnswer && ['open', 'agreed', 'disputed'].includes(item.status)) {
      await TzuratItem.updateOne(
        { _id: item._id, status: item.status, answers: { $size: (item.answers || []).length } },
        {
          $pull: { answers: { user: sub.user, via: 'page', $or: [{ submission: sub._id }, { submission: null }] } },
          $set: { status: 'open', decision: null, pointsAwarded: item.status === 'agreed' ? false : item.pointsAwarded },
        }
      );
    }
    const after = await TzuratItem.findById(item._id).lean();
    if (!after) continue;
    if ((after.answers || []).some((a) =>
      String(a.user) === String(sub.user) && a.via === 'page' && (!a.submission || String(a.submission) === String(sub._id))
    )) throw new Error('Submission answer changed concurrently during rejection');
    for (const userId of step.rollbackUsers || []) {
      await applyPointEvent(userId, `submission:${sub._id}:reject:item:${item._id}:user:${userId}`, -POINTS_AGREED);
    }
    if ((step.manual || after.manual) && !(after.answers || []).length) {
      await TzuratItem.updateOne({ _id: item._id, status: 'open', answers: { $size: 0 } }, { $set: { status: 'obsolete' } });
    } else if (after.status === 'open') {
      await settle(item._id, after, now);
    }
  }
}

/** דחייה (מהגשה ממתינה, או ממאושרת שעוד לא יצאה בייצוא). ← {ok, submission} */
export async function rejectSubmission(subId, admin, { note = '' } = {}, now = new Date()) {
  if (!isObjectId(String(subId))) return fail(404, 'ההגשה לא נמצאה');
  let prev = await TzuratSubmission.findById(subId).lean();
  if (!prev) return fail(404, 'ההגשה לא נמצאה');
  if (!['submitted', 'approved'].includes(prev.status) || (prev.status === 'approved' && prev.exportedAt) ||
      (prev.reviewAction && prev.reviewAction !== 'reject')) {
    return (await TzuratSubmission.exists({ _id: oid(subId) })) ? fail(409, 'אי אפשר לדחות את ההגשה הזו', 'reviewed') : fail(404, 'ההגשה לא נמצאה');
  }
  if (!prev.reviewAction) {
    const data = {
      wasApproved: prev.status === 'approved',
      pointsAwarded: Boolean(prev.pointsAwarded),
      reviewer: reviewerOf(admin, note, now),
      undoPlan: await rejectionPlan(prev),
    };
    const claimed = await TzuratSubmission.findOneAndUpdate(
      { _id: prev._id, status: prev.status, reviewAction: null, ...(prev.status === 'approved' ? { exportedAt: null } : {}) },
      { $set: { reviewAction: 'reject', reviewData: data } },
      { returnDocument: 'after', lean: true }
    );
    if (!claimed) {
      prev = await TzuratSubmission.findById(prev._id).lean();
      if (prev?.reviewAction !== 'reject') return fail(409, 'ההגשה כבר מטופלת בפעולה אחרת', 'processing');
    } else prev = claimed;
  }
  const data = prev.reviewData;
  await undoPageAnswers(prev, data.undoPlan || [], now);
  if (data.wasApproved && data.pointsAwarded) {
    await applyPointEvent(prev.user, `submission:${prev._id}:rejected`, -POINTS_APPROVED);
  }
  await TzuratPage.updateOne(
    { _id: prev.page, round: prev.round || 1 },
    [{
      $set: {
        activeCount: {
          $cond: [
            { $in: [prev._id, { $ifNull: ['$releaseEvents', []] }] },
            { $ifNull: ['$activeCount', 0] },
            { $max: [0, { $subtract: [{ $ifNull: ['$activeCount', 0] }, 1] }] },
          ],
        },
        approvedCount: {
          $cond: [
            { $or: [{ $in: [prev._id, { $ifNull: ['$releaseEvents', []] }] }, { $eq: [data.wasApproved, false] }] },
            { $ifNull: ['$approvedCount', 0] },
            { $max: [0, { $subtract: [{ $ifNull: ['$approvedCount', 0] }, 1] }] },
          ],
        },
        submitters: { $setDifference: [{ $ifNull: ['$submitters', []] }, [prev.user]] },
        releaseEvents: { $setUnion: [{ $ifNull: ['$releaseEvents', []] }, [prev._id]] },
      },
    }],
    { updatePipeline: true }
  );
  if (data.wasApproved) {
    await TzuratPage.updateOne(
      { _id: prev.page, round: prev.round || 1, status: 'done', $expr: { $lt: ['$approvedCount', '$required'] } },
      { $set: { status: 'open' } }
    );
  }
  const done = await TzuratSubmission.updateOne(
    { _id: prev._id, reviewAction: 'reject', status: { $in: ['submitted', 'approved'] } },
    { $set: { status: 'rejected', pointsAwarded: false, ...data.reviewer, reviewAction: null, reviewData: null } }
  );
  if (!done.matchedCount) return fail(409, 'ההגשה כבר טופלה', 'reviewed');
  return { ok: true, submission: await TzuratSubmission.findById(prev._id).lean() };
}
