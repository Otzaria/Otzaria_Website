// צורת הדף — המתנדב: דף הכניסה (overview), "התרומות שלי" ודיווח חופשי.
// ייבוא יחסי (node:test).

import mongoose from 'mongoose';
import TzuratItem from '../../models/TzuratItem.js';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratSubmission from '../../models/TzuratSubmission.js';
import TzuratReport from '../../models/TzuratReport.js';
import User from '../../models/User.js';
import { listBooks } from './pages.js';
import { fastStats } from './items.js';
import { normalizeReport } from './reportRules.js';
import { whoOf, isObjectId, cleanText } from './common.js';

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error, code) => ({ ok: false, status, error, ...(code ? { code } : {}) });
const LIST_LIMIT = 100;

export async function userFlags(userId) {
  const u = await User.findById(userId, { tzuratPracticeDone: 1, points: 1 }).lean();
  return { practiceDone: !!u?.tzuratPracticeDone, points: u?.points || 0 };
}

/** CONTRACT GET overview ← {books, me, canAdmin} */
export async function overview(userId, { canAdmin = false } = {}) {
  const uid = oid(userId);
  const [books, flags, stats, subs, reports] = await Promise.all([
    listBooks(),
    userFlags(userId),
    fastStats(userId),
    TzuratSubmission.aggregate([{ $match: { user: uid } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    TzuratReport.countDocuments({ user: uid }),
  ]);
  const by = Object.fromEntries(subs.map((s) => [s._id, s.n]));
  return {
    books,
    me: {
      practiceDone: flags.practiceDone,
      decisions: stats.mine,
      agreed: stats.mineAgreed,
      pages: (by.submitted || 0) + (by.approved || 0),
      pagesApproved: by.approved || 0,
      reports,
      points: flags.points,
    },
    canAdmin,
  };
}

const iso = (d) => (d ? new Date(d).toISOString() : null);

// מידע על העמודים (מסכת, דף) למזהים
async function pagesInfo(ids) {
  const uniq = [...new Set(ids.map(String))].filter(isObjectId).map(oid);
  if (!uniq.length) return new Map();
  const rows = await TzuratPage.find({ _id: { $in: uniq } }, { slug: 1, masechet: 1, daf: 1, dafKey: 1 }).lean();
  return new Map(rows.map((p) => [String(p._id), p]));
}

/** CONTRACT GET mine */
export async function mine(userId) {
  const uid = oid(userId);
  const [flags, byStatus, stats, subs, reports] = await Promise.all([
    userFlags(userId),
    TzuratItem.aggregate([{ $match: { 'answers.user': uid, practice: { $ne: true } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    fastStats(userId),
    TzuratSubmission.find({ user: uid }, { page: 1, slug: 1, dafKey: 1, status: 1, reviewNote: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(LIST_LIMIT).lean(),
    TzuratReport.find({ user: uid }, { page: 1, slug: 1, dafKey: 1, category: 1, text: 1, status: 1, resolution: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(LIST_LIMIT).lean(),
  ]);
  const st = Object.fromEntries(byStatus.map((r) => [r._id, r.n]));
  const total = Object.values(st).reduce((a, b) => a + b, 0);
  const info = await pagesInfo([...subs.map((s) => s.page), ...reports.map((r) => r.page)]);
  return {
    points: flags.points,
    decisions: { total, agreed: stats.mineAgreed, disputed: (st.disputed || 0) + (st.flagged || 0), open: st.open || 0 },
    pages: subs.map((s) => {
      const p = info.get(String(s.page));
      return { id: String(s.page), slug: s.slug, masechet: p?.masechet || '', daf: p?.daf || s.dafKey, status: s.status, reviewNote: s.reviewNote || '', at: iso(s.createdAt) };
    }),
    reports: reports.map((r) => {
      const p = info.get(String(r.page));
      return {
        id: String(r._id),
        slug: r.slug,
        masechet: p?.masechet || '',
        daf: p?.daf || r.dafKey,
        category: r.category,
        text: r.text,
        status: r.status,
        resolution: r.resolution ? { note: r.resolution.note || '', buildId: r.resolution.buildId || '', at: iso(r.resolution.at) } : null,
        at: iso(r.createdAt),
      };
    }),
  };
}

/** דיווח חופשי {page, category, text, regions} ← {ok, id} */
export async function createReport(user, body) {
  if (!isObjectId(String(body?.page))) return fail(400, 'עמוד לא תקין');
  const v = normalizeReport(body);
  if (v.error) return fail(400, v.error);
  const page = await TzuratPage.findById(body.page, { slug: 1, dafKey: 1 }).lean();
  if (!page) return fail(404, 'העמוד לא נמצא');
  const uid = oid(user.id);
  const doc = await TzuratReport.create({
    page: page._id,
    slug: page.slug,
    dafKey: page.dafKey,
    user: uid,
    who: whoOf(uid),
    userName: cleanText(user.name, 100),
    ...v.report,
  });
  return { ok: true, id: String(doc._id) };
}
