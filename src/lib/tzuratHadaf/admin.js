// צורת הדף — מסכי הניהול: סטטיסטיקה, חבילות, רשימות (החלטות, הגשות, דיווחים) ופרטי הגשה. ייבוא יחסי (node:test).

import mongoose from 'mongoose';
import TzuratBatch from '../../models/TzuratBatch.js';
import TzuratItem from '../../models/TzuratItem.js';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratSubmission from '../../models/TzuratSubmission.js';
import TzuratReport from '../../models/TzuratReport.js';
import TzuratUpload from '../../models/TzuratUpload.js';
import { listBooks } from './pages.js';
import { adminItemShape, pageShape, pageStateFor, uploadShape, pageImageUrl } from './shapes.js';
import { REPORT_STATUSES, REPORT_CATEGORIES } from './reportRules.js';
import { SLUG_RE, isObjectId } from './common.js';

export const PAGE_SIZE = 30;
const ITEM_STATUSES = ['open', 'agreed', 'disputed', 'resolved', 'flagged', 'obsolete'];
const SUB_STATUSES = ['submitted', 'approved', 'rejected'];
const DAY_MS = 24 * 60 * 60 * 1000;

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error, code) => ({ ok: false, status, error, ...(code ? { code } : {}) });
const toObj = (rows) => Object.fromEntries(rows.map((r) => [r._id ?? 'none', r.n]));

export function pageParam(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

/** CONTRACT GET stats */
export async function adminStats(now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const [books, byStatus, byKind, subs, reps, volunteers, active, uploads] = await Promise.all([
    listBooks({ includePaused: true }),
    TzuratItem.aggregate([{ $match: { practice: { $ne: true } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    TzuratItem.aggregate([{ $match: { practice: { $ne: true }, status: { $ne: 'obsolete' } } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]),
    TzuratSubmission.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    TzuratReport.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    TzuratItem.aggregate([{ $unwind: '$answers' }, { $group: { _id: '$answers.user' } }, { $count: 'n' }]),
    TzuratItem.aggregate([
      { $match: { 'answers.at': { $gte: since } } },
      { $unwind: '$answers' },
      { $match: { 'answers.at': { $gte: since } } },
      { $group: { _id: '$answers.user' } },
      { $count: 'n' },
    ]),
    TzuratUpload.find({}).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  // מגישי עמודים שלא ענו על שאלות — נספרים גם הם
  const [subUsers, subActive] = await Promise.all([
    TzuratSubmission.distinct('user'),
    TzuratSubmission.distinct('user', { createdAt: { $gte: since } }),
  ]);
  return {
    books,
    items: { byStatus: toObj(byStatus), byKind: toObj(byKind) },
    submissions: { byStatus: toObj(subs) },
    reports: { byStatus: toObj(reps) },
    volunteers: { total: Math.max(volunteers[0]?.n || 0, subUsers.length), active7d: Math.max(active[0]?.n || 0, subActive.length) },
    uploads: uploads.map(uploadShape),
  };
}

export async function listBatches() {
  const rows = await TzuratBatch.find({}).sort({ order: 1, slug: 1 }).lean();
  return rows.map((b) => ({ slug: b.slug, masechet: b.masechet, order: b.order, buildId: b.buildId, pages: b.pages, items: b.items, status: b.status, importedAt: b.importedAt }));
}

export async function setBatchStatus(slug, status) {
  if (!SLUG_RE.test(String(slug))) return fail(404, 'החבילה לא נמצאה');
  if (status !== 'active' && status !== 'paused') return fail(400, 'סטטוס לא מוכר');
  const b = await TzuratBatch.findOneAndUpdate({ slug }, { $set: { status } }, { returnDocument: 'after', lean: true });
  if (!b) return fail(404, 'החבילה לא נמצאה');
  return { ok: true, batch: { slug: b.slug, masechet: b.masechet, order: b.order, buildId: b.buildId, pages: b.pages, items: b.items, status: b.status, importedAt: b.importedAt } };
}

async function pagesById(ids) {
  const uniq = [...new Set(ids.filter(Boolean).map(String))].filter(isObjectId).map(oid);
  if (!uniq.length) return new Map();
  const rows = await TzuratPage.find({ _id: { $in: uniq } }, { slug: 1, masechet: 1, daf: 1, dafKey: 1, buildId: 1, round: 1, scan: 1, ours: 1 }).lean();
  return new Map(rows.map((p) => [String(p._id), p]));
}

/** GET items?status=&slug=&kind=&page= ← {items, total, page, pages} */
export async function listItems({ status, slug, kind, page = 1 } = {}) {
  const filter = { practice: { $ne: true } };
  if (status) {
    if (!ITEM_STATUSES.includes(status)) return fail(400, 'סטטוס לא מוכר');
    filter.status = status;
  }
  if (slug) {
    if (!SLUG_RE.test(slug)) return fail(400, 'מסכת לא תקינה');
    filter.slug = slug;
  }
  // mg — כל הגיליון והשוליים (כל מה שאינו גמרא, רש"י או תוספות; kindLabel → 'שוליים'), כמו במסנן של מסך הניהול
  if (kind === 'mg') filter.kind = { $nin: ['g', 'r', 't'] };
  else if (kind) filter.kind = String(kind).slice(0, 20);
  const p = pageParam(page);
  const [rows, total] = await Promise.all([
    TzuratItem.find(filter).sort({ updatedAt: -1, _id: 1 }).skip((p - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    TzuratItem.countDocuments(filter),
  ]);
  const pages = await pagesById(rows.map((r) => r.page));
  return { ok: true, items: rows.map((r) => adminItemShape(r, pages.get(String(r.page)))), total, page: p, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function adminItem(itemId) {
  const item = await TzuratItem.findById(itemId).lean();
  if (!item) return null;
  const pages = await pagesById([item.page]);
  return adminItemShape(item, pages.get(String(item.page)));
}

const counts = (s) => ({
  anchors: (s.anchors || []).length,
  items: (s.itemAnswers || []).length,
  manual: (s.manualItems || []).length,
  reports: (s.reports || []).length,
});

/** GET submissions?status=&page= ← {submissions, total} */
export async function listSubmissions({ status, page = 1 } = {}) {
  const filter = { status: { $in: SUB_STATUSES } };
  if (status) {
    if (!SUB_STATUSES.includes(status)) return fail(400, 'סטטוס לא מוכר');
    filter.status = status;
  }
  const p = pageParam(page);
  const [rows, total] = await Promise.all([
    TzuratSubmission.find(filter, { lineOps: 0 })
      .sort({ createdAt: status === 'submitted' ? 1 : -1 })
      .skip((p - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    TzuratSubmission.countDocuments(filter),
  ]);
  const pages = await pagesById(rows.map((r) => r.page));
  return {
    ok: true,
    submissions: rows.map((s) => {
      const pg = pages.get(String(s.page));
      return {
        id: String(s._id),
        slug: s.slug,
        masechet: pg?.masechet || '',
        daf: pg?.daf || s.dafKey,
        userName: s.userName,
        round: s.round,
        status: s.status,
        counts: counts(s),
        at: s.createdAt,
      };
    }),
    total,
    page: p,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export const plainSubmission = (s) => ({
  ...s,
  id: String(s._id),
  page: String(s.page),
  user: String(s.user),
  manualItems: (s.manualItems || []).map(String),
  reports: (s.reports || []).map(String),
  itemAnswers: (s.itemAnswers || []).map((a) => ({ ...a, item: String(a.item) })),
});

/** GET submissions/[id] ← {submission, page, anchors, items, reports} */
export async function submissionDetail(subId) {
  if (!isObjectId(String(subId))) return fail(404, 'ההגשה לא נמצאה');
  const s = await TzuratSubmission.findById(subId).lean();
  if (!s) return fail(404, 'ההגשה לא נמצאה');
  const page = await TzuratPage.findById(s.page).lean();
  const itemIds = [...(s.itemAnswers || []).map((a) => a.item), ...(s.manualItems || [])];
  const [items, reports] = await Promise.all([
    TzuratItem.find({ _id: { $in: itemIds } }).lean(),
    TzuratReport.find({ _id: { $in: s.reports || [] } }).lean(),
  ]);
  return {
    ok: true,
    submission: plainSubmission(s),
    page: page ? pageShape(page, pageStateFor(page, null)) : null,
    anchors: s.anchors || [],
    items: items.map((it) => adminItemShape(it, page)),
    reports: reports.map((r) => reportShape(r, page)),
  };
}

export function reportShape(r, page) {
  const { _id, __v, page: pg, user, submission, ...rest } = r;
  return {
    ...rest,
    id: String(_id),
    page: pg ? String(pg) : null,
    user: user ? String(user) : null,
    submission: submission ? String(submission) : null,
    userName: r.userName || '',
    masechet: page?.masechet || '',
    daf: page?.daf || r.dafKey || '',
    scanUrl: page?.scan?.path ? pageImageUrl(page, 'scan') : null,
    oursUrl: page?.ours?.path ? pageImageUrl(page, 'ours') : null,
  };
}

/** GET reports?status=&category=&slug=&page= ← {reports, total, page, pages} */
export async function listReports({ status, category, slug, page = 1 } = {}) {
  const filter = {};
  if (status) {
    if (!REPORT_STATUSES.includes(status)) return fail(400, 'סטטוס לא מוכר');
    filter.status = status;
  }
  if (category) {
    if (!REPORT_CATEGORIES.includes(category)) return fail(400, 'סוג דיווח לא מוכר');
    filter.category = category;
  }
  if (slug) {
    if (!SLUG_RE.test(slug)) return fail(400, 'מסכת לא תקינה');
    filter.slug = slug;
  }
  const p = pageParam(page);
  const [rows, total] = await Promise.all([
    TzuratReport.find(filter).sort({ createdAt: -1 }).skip((p - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    TzuratReport.countDocuments(filter),
  ]);
  const pages = await pagesById(rows.map((r) => r.page));
  return { ok: true, reports: rows.map((r) => reportShape(r, pages.get(String(r.page)))), total, page: p, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
