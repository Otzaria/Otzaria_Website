// צורת הדף — בדיקת עמוד בצד השרת: רשימת המסכתות, רשת העמודים של מסכת, תפיסה/שחרור/חידוש (48 שעות, עד 5,
// שבת וחג אינם נספרים — leaseEnd של הגהת העמודים), העמוד לבדיקה, והטיוטה. ייבוא יחסי (node:test).
// תוצאות: {ok:true, ...} או {ok:false, status, error, code}.

import mongoose from 'mongoose';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratItem from '../../models/TzuratItem.js';
import TzuratBatch from '../../models/TzuratBatch.js';
import TzuratDraft from '../../models/TzuratDraft.js';
import TzuratSubmission from '../../models/TzuratSubmission.js';
import { leaseEnd } from '../pageProof/lease.js';
import { pageStateFor, pageShape, fastItemShape, reviewVersion } from './shapes.js';
import { isObjectId } from './common.js';

export const CLAIM_HOURS = 48;
export const MAX_HELD = 5;
export const DRAFT_STAGES = Object.freeze(['overview', 'lines', 'text', 'submit']);
export const MAX_DRAFT_BYTES = 2 * 1024 * 1024;

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error, code) => ({ ok: false, status, error, ...(code ? { code } : {}) });

const MSG = {
  notFound: 'העמוד לא נמצא',
  paused: 'המסכת מושהית כרגע — אפשר להמשיך בעמודים שכבר בטיפולכם, אבל לא לתפוס חדשים',
  tooMany: `אפשר להחזיק עד ${MAX_HELD} עמודים בבת אחת — הגישו או שחררו עמודים כדי לתפוס עוד`,
  taken: 'העמוד כבר נתפס או הוגש בידי מתנדב אחר',
  submitted: 'כבר הגשתם את העמוד הזה',
  closed: 'העמוד סגור לבדיקה',
  done: 'העמוד כבר נבדק',
  notHolder: 'העמוד אינו בטיפולכם (התפיסה פגה או שוחררה) — תפסו אותו שוב כדי להמשיך',
  stale: 'הטיוטה נשמרה בינתיים מחלון אחר — טענו את העמוד מחדש',
};

// ---------- מסכתות ----------

/** המסכתות עם המונים (CONTRACT overview.books). includePaused — למנהל */
export async function listBooks({ includePaused = false } = {}) {
  const batches = await TzuratBatch.find(includePaused ? {} : { status: { $ne: 'paused' } }).sort({ order: 1, slug: 1 }).lean();
  if (!batches.length) return [];
  const slugs = batches.map((b) => b.slug);
  const [pageRows, itemRows] = await Promise.all([
    TzuratPage.aggregate([{ $match: { slug: { $in: slugs } } }, { $group: { _id: { slug: '$slug', status: '$status' }, n: { $sum: 1 } } }]),
    TzuratItem.aggregate([
      { $match: { slug: { $in: slugs }, practice: { $ne: true }, status: { $ne: 'obsolete' } } },
      { $group: { _id: { slug: '$slug', status: '$status' }, n: { $sum: 1 } } },
    ]),
  ]);
  const count = (rows, slug, statuses) =>
    rows.filter((r) => r._id.slug === slug && (!statuses || statuses.includes(r._id.status))).reduce((s, r) => s + r.n, 0);
  return batches.map((b) => ({
    slug: b.slug,
    masechet: b.masechet,
    order: b.order,
    pages: count(pageRows, b.slug),
    pagesOpen: count(pageRows, b.slug, ['open']),
    pagesDone: count(pageRows, b.slug, ['done']),
    items: count(itemRows, b.slug),
    itemsOpen: count(itemRows, b.slug, ['open']),
    itemsAgreed: count(itemRows, b.slug, ['agreed', 'resolved']),
    itemsDisputed: count(itemRows, b.slug, ['disputed', 'flagged']),
    ...(includePaused ? { status: b.status, buildId: b.buildId, importedAt: b.importedAt } : {}),
  }));
}

// ---------- רשת העמודים ----------

function heldCount(uid, now) {
  return TzuratPage.countDocuments({ leasedBy: uid, leasedUntil: { $gt: now }, submitters: { $ne: uid } });
}

// ההגשות של הצופה לעמודים (בסבב הנוכחי של כל עמוד) ← Map(pageId → status)
async function mySubmissions(pages, uid) {
  const out = new Map();
  if (!pages.length) return out;
  const subs = await TzuratSubmission.find(
    { page: { $in: pages.map((p) => p._id) }, user: uid, status: { $in: ['processing', 'submitted', 'approved'] } },
    { page: 1, status: 1, round: 1 }
  ).lean();
  const roundOf = new Map(pages.map((p) => [String(p._id), p.round || 1]));
  for (const s of subs) {
    const k = String(s.page);
    // Recovery uses the stored input, including when a newer build has opened another round.
    if (s.status === 'processing') { out.set(k, 'processing'); continue; }
    if ((s.round || 1) !== roundOf.get(k)) continue;
    if (!['approved', 'processing'].includes(out.get(k))) out.set(k, s.status);
  }
  return out;
}

const GRID_FIELDS = { daf: 1, dafKey: 1, order: 1, status: 1, round: 1, required: 1, activeCount: 1, submitters: 1, leasedBy: 1, leasedUntil: 1, nonVilna: 1 };

/** CONTRACT books/[slug]/pages ← {ok, book, pages, held, maxHeld} */
export async function bookPages(slug, userId, now = new Date()) {
  const uid = oid(userId);
  const batch = await TzuratBatch.findOne({ slug }).lean();
  if (!batch) return fail(404, 'המסכת לא נמצאה');
  const pages = await TzuratPage.find({ slug }, GRID_FIELDS).sort({ order: 1, dafKey: 1 }).lean();
  const [mine, pending, heldDocs] = await Promise.all([
    mySubmissions(pages, uid),
    TzuratItem.aggregate([{ $match: { slug, status: 'open', practice: { $ne: true } } }, { $group: { _id: '$page', n: { $sum: 1 } } }]),
    // כל העמודים שבידי הצופה, גם במסכתות אחרות (המגבלה של MAX_HELD היא על כולם — כמו heldCount)
    TzuratPage.find({ leasedBy: uid, leasedUntil: { $gt: now }, submitters: { $ne: uid } }, { _id: 1 }).lean(),
  ]);
  const pendingBy = new Map(pending.map((r) => [String(r._id), r.n]));
  const held = heldDocs.map((d) => String(d._id));
  const out = pages.map((p) => {
    const state = pageStateFor(p, uid, mine.get(String(p._id)) || null, now);
    if (state === 'mine' && !held.includes(String(p._id))) held.push(String(p._id));
    return {
      id: String(p._id),
      daf: p.daf,
      dafKey: p.dafKey,
      state,
      pendingCount: pendingBy.get(String(p._id)) || 0,
      round: p.round || 1,
      nonVilna: !!p.nonVilna,
    };
  });
  return {
    ok: true,
    book: { slug: batch.slug, masechet: batch.masechet, pages: pages.length, pagesDone: pages.filter((p) => p.status === 'done').length },
    pages: out,
    held,
    maxHeld: MAX_HELD,
  };
}

// ---------- תפיסה ----------

export function claimFilter(uid, now) {
  return {
    status: 'open',
    submitters: { $ne: uid },
    $expr: { $lt: ['$activeCount', '$required'] },
    $or: [{ leasedUntil: null }, { leasedUntil: { $lt: now } }, { leasedBy: uid }],
  };
}

async function refusal(pageId, uid, now) {
  const p = await TzuratPage.findById(pageId, GRID_FIELDS).lean();
  if (!p) return fail(404, MSG.notFound);
  const state = pageStateFor(p, uid, null, now);
  if (state === 'submitted') return fail(409, MSG.submitted, 'submitted');
  if (state === 'closed') return fail(409, MSG.closed, 'closed');
  if (state === 'done') return fail(409, MSG.done, 'done');
  return fail(409, MSG.taken, 'taken');
}

/** תפיסה ← {ok, leasedUntil} */
export async function claimPage(pageId, userId, now = new Date()) {
  if (!isObjectId(String(pageId))) return fail(404, MSG.notFound);
  const uid = oid(userId);
  const page = await TzuratPage.findById(pageId, { slug: 1, leasedBy: 1, leasedUntil: 1 }).lean();
  if (!page) return fail(404, MSG.notFound);
  const already = page.leasedBy && String(page.leasedBy) === String(uid) && new Date(page.leasedUntil) > now;
  if (!already) {
    if (await TzuratBatch.exists({ slug: page.slug, status: 'paused' })) return fail(409, MSG.paused, 'paused');
    if ((await heldCount(uid, now)) >= MAX_HELD) return fail(409, MSG.tooMany, 'too_many');
  }
  if (already) {
    // המחזיק עצמו — חידוש (לעולם לא מקצר), בלי לספור מול MAX_HELD
    const renewed = await renewLease(page._id, uid, now);
    if (renewed) return { ok: true, leasedUntil: renewed.leasedUntil };
  }
  const until = leaseEnd(now, CLAIM_HOURS);
  const doc = await TzuratPage.findOneAndUpdate(
    { _id: page._id, ...claimFilter(uid, now) },
    { $set: { leasedBy: uid, leasedUntil: until } },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return refusal(page._id, uid, now);
  // שתי תפיסות במקביל עלולות לעבור את הבדיקה שלמעלה — סופרים שוב, והתפיסה הזו מתבטלת אם עברנו את התקרה
  if (!already && (await heldCount(uid, now)) > MAX_HELD) {
    await TzuratPage.updateOne({ _id: page._id, leasedBy: uid, leasedUntil: until }, { $set: { leasedBy: null, leasedUntil: null } });
    return fail(409, MSG.tooMany, 'too_many');
  }
  return { ok: true, leasedUntil: doc.leasedUntil };
}

export async function releasePage(pageId, userId) {
  if (!isObjectId(String(pageId))) return fail(404, MSG.notFound);
  await TzuratPage.updateOne({ _id: oid(pageId), leasedBy: oid(userId) }, { $set: { leasedBy: null, leasedUntil: null } });
  return { ok: true };
}

// פתיחת העמוד בידי המחזיק מחדשת את התפיסה ל-48 שעות מלאות (לעולם לא מקצרת)
export async function renewLease(pageId, userId, now = new Date()) {
  const until = leaseEnd(now, CLAIM_HOURS);
  return TzuratPage.findOneAndUpdate(
    { _id: oid(pageId), leasedBy: oid(userId), leasedUntil: { $gt: now }, status: { $ne: 'done' } },
    [{ $set: { leasedUntil: { $max: [{ $ifNull: ['$leasedUntil', until] }, until] } } }],
    { returnDocument: 'after', lean: true, updatePipeline: true }
  );
}

// ---------- העמוד לבדיקה ----------

/** CONTRACT GET pages/[id] ← {ok, page, items, draft, prev, next} */
export async function pageDetail(pageId, userId, { now = new Date() } = {}) {
  if (!isObjectId(String(pageId))) return fail(404, MSG.notFound);
  const uid = oid(userId);
  let page = await TzuratPage.findById(pageId).lean();
  if (!page) return fail(404, MSG.notFound);
  const renewed = await renewLease(page._id, uid, now);
  if (renewed) page = { ...page, leasedUntil: renewed.leasedUntil };
  const [mine, items, draft, prev, next] = await Promise.all([
    mySubmissions([page], uid),
    TzuratItem.find({
      page: page._id,
      status: 'open',
      practice: { $ne: true },
      'answers.user': { $ne: uid },
    })
      .sort({ score: -1, _id: 1 })
      .limit(500)
      .lean(),
    TzuratDraft.findOne({ page: page._id }).lean(),
    TzuratPage.findOne({ slug: page.slug, order: { $lt: page.order } }, { daf: 1 }).sort({ order: -1 }).lean(),
    TzuratPage.findOne({ slug: page.slug, order: { $gt: page.order } }, { daf: 1 }).sort({ order: 1 }).lean(),
  ]);
  const state = pageStateFor(page, uid, mine.get(String(page._id)) || null, now);
  const myDraft = draft && draft.version === reviewVersion(page) && String(draft.user) === String(uid) ? { stage: draft.stage, state: draft.state, updatedAt: draft.updatedAt } : null;
  return {
    ok: true,
    page: pageShape(page, state),
    items: items.map((it) => fastItemShape(it, page, uid)),
    draft: myDraft,
    processing: mine.get(String(page._id)) === 'processing',
    prev: prev ? { id: String(prev._id), daf: prev.daf } : null,
    next: next ? { id: String(next._id), daf: next.daf } : null,
  };
}

// ---------- טיוטה ----------

export const isHolder = (page, uid, now = new Date()) =>
  !!page?.leasedBy && String(page.leasedBy) === String(uid) && new Date(page.leasedUntil).getTime() > now.getTime();

/**
 * שמירת טיוטה של המחזיק: {stage, state, baseUpdatedAt}. baseUpdatedAt — ה-updatedAt של הטיוטה שהלקוח טען
 * (null — אין טיוטה). טיוטה של מחזיק קודם נדרסת. ← {ok, updatedAt} או 409 stale/not_holder.
 */
export async function saveDraft(pageId, userId, { stage, state, version, baseUpdatedAt = null } = {}, now = new Date()) {
  if (!isObjectId(String(pageId))) return fail(404, MSG.notFound);
  if (!DRAFT_STAGES.includes(stage)) return fail(400, 'שלב לא מוכר');
  const uid = oid(userId);
  const page = await TzuratPage.findById(pageId, { leasedBy: 1, leasedUntil: 1, round: 1, buildId: 1 }).lean();
  if (!page) return fail(404, MSG.notFound);
  if (version !== reviewVersion(page)) return fail(409, 'העמוד עודכן — טענו אותו מחדש', 'stale');
  if (!isHolder(page, uid, now)) return fail(409, MSG.notHolder, 'not_holder');
  const cur = await TzuratDraft.findOne({ page: page._id }, { user: 1, updatedAt: 1, version: 1 }).lean();
  // Read the draft first, then recheck the page: an import cannot let an old tab
  // overwrite a fresh-version draft (the write below also compares updatedAt).
  const currentPage = await TzuratPage.findById(pageId, { buildId: 1, round: 1, leasedBy: 1, leasedUntil: 1 }).lean();
  if (!currentPage || version !== reviewVersion(currentPage)) return fail(409, 'העמוד עודכן — טענו אותו מחדש', 'stale');
  if (!isHolder(currentPage, uid, now)) return fail(409, MSG.notHolder, 'not_holder');
  const set = { user: uid, stage, state: state ?? null, version };
  if (!cur) {
    try {
      const d = await TzuratDraft.create({ page: page._id, ...set });
      return { ok: true, updatedAt: d.updatedAt };
    } catch (e) {
      if (e?.code === 11000) return fail(409, MSG.stale, 'stale');
      throw e;
    }
  }
  const mineCur = String(cur.user) === String(uid) && cur.version === version;
  const base = baseUpdatedAt ? new Date(baseUpdatedAt).getTime() : NaN;
  if (mineCur && base !== new Date(cur.updatedAt).getTime()) return fail(409, MSG.stale, 'stale');
  const d = await TzuratDraft.findOneAndUpdate({ _id: cur._id, updatedAt: cur.updatedAt }, { $set: set }, { returnDocument: 'after', lean: true });
  if (!d) return fail(409, MSG.stale, 'stale');
  return { ok: true, updatedAt: d.updatedAt };
}

export async function dropDraft(pageId, { userId, version } = {}) {
  await TzuratDraft.deleteOne({ page: oid(pageId), ...(userId ? { user: oid(userId) } : {}), ...(version ? { version } : {}) });
}
