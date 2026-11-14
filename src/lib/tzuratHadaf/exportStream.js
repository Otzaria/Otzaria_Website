// צורת הדף — זרם הייצוא (PACKAGE.md §3): async generator של שורות, קורסור לכל סוג (לא טוענים הכול לזיכרון).
// since — לפי updatedAt. anchors/checks — רק מהגשות שאושרו (וההגשות שיצאו מסומנות exportedAt — הגשה שיצאה כבר
// אינה נדחית). contributors — מחושב בקיבוץ במסד. השורות עצמן — exportRows.js. ייבוא יחסי (node:test).

import TzuratItem from '../../models/TzuratItem.js';
import TzuratPage from '../../models/TzuratPage.js';
import TzuratSubmission from '../../models/TzuratSubmission.js';
import TzuratReport from '../../models/TzuratReport.js';
import User from '../../models/User.js';
import { metaRow, decisionRow, retractionRow, anchorRows, checkRows, reportRow, contributorRow } from './exportRows.js';

const sinceFilter = (since) => (since ? { updatedAt: { $gt: since } } : {});

// מטמון קטן של פרטי עמודים (מסכת, דף) לשורות של הגשות ודיווחים
function pageCache() {
  const map = new Map();
  return async (id) => {
    const k = String(id);
    if (!map.has(k)) {
      if (map.size > 5000) map.clear();
      map.set(k, await TzuratPage.findById(id, { masechet: 1, daf: 1 }).lean());
    }
    return map.get(k);
  };
}

async function* cursorOf(query) {
  const cursor = query.cursor();
  try {
    for (let doc = await cursor.next(); doc; doc = await cursor.next()) yield doc;
  } finally {
    await cursor.close().catch(() => {});
  }
}

export async function contributors() {
  const [answers, pages, reports] = await Promise.all([
    TzuratItem.aggregate([{ $match: { practice: { $ne: true } } }, { $unwind: '$answers' }, { $group: { _id: '$answers.user', n: { $sum: 1 } } }]),
    TzuratSubmission.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: '$user', n: { $sum: 1 } } }]),
    TzuratReport.aggregate([{ $group: { _id: '$user', n: { $sum: 1 } } }]),
  ]);
  const by = new Map();
  const add = (rows, field) => {
    for (const r of rows) {
      if (!r._id) continue;
      const k = String(r._id);
      if (!by.has(k)) by.set(k, { user: r._id, decisions: 0, pages: 0, reports: 0 });
      by.get(k)[field] = r.n;
    }
  };
  add(answers, 'decisions');
  add(pages, 'pages');
  add(reports, 'reports');
  const users = await User.find({ _id: { $in: [...by.values()].map((c) => c.user) } }, { name: 1 }).lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return [...by.values()].map((c) => ({ ...c, name: names.get(String(c.user)) || '' })).sort((a, b) => String(a.user).localeCompare(String(b.user)));
}

/** שורות הייצוא לפי הסדר: meta, decision, anchor+check, report, contributor */
export async function* exportRowsStream({ types, since = null, now = new Date(), markExported = true, exportId = null, onSubmission = null } = {}) {
  const want = new Set(types);
  yield { ...metaRow(since, now), ...(exportId ? { exportId: String(exportId) } : {}) };
  if (want.has('decision')) {
    const q = TzuratItem.find({ practice: { $ne: true }, status: { $in: ['agreed', 'resolved'] }, ...sinceFilter(since) }).sort({ _id: 1 }).lean();
    for await (const item of cursorOf(q)) {
      const row = decisionRow(item);
      if (!row) continue;
      yield row;
      if (markExported && !item.exportedDecision) {
        // בלי לגעת ב-updatedAt (אחרת הפריט "משתנה" בכל ייצוא)
        await TzuratItem.updateOne({ _id: item._id }, { $set: { exportedDecision: true } }, { timestamps: false });
      }
    }
    // ביטולים (רק בייצוא since): הכרעה שיצאה בעבר והפריט כבר אינו agreed/resolved (נפתח מחדש, נדחה, obsolete)
    if (since) {
      const rq = TzuratItem.find({
        practice: { $ne: true },
        exportedDecision: true,
        status: { $nin: ['agreed', 'resolved'] },
        updatedAt: { $gt: since },
      })
        .sort({ _id: 1 })
        .lean();
      for await (const item of cursorOf(rq)) yield retractionRow(item);
    }
  }
  if (want.has('anchor') || want.has('check')) {
    const pageOf = pageCache();
    const q = TzuratSubmission.find({ status: 'approved', ...sinceFilter(since) }).sort({ _id: 1 }).lean();
    for await (const candidate of cursorOf(q)) {
      const sub = markExported
        ? await TzuratSubmission.findOneAndUpdate(
            { _id: candidate._id, status: 'approved' },
            [{ $set: { exportedAt: { $ifNull: ['$exportedAt', now] } } }],
            { returnDocument: 'after', lean: true, timestamps: false, updatePipeline: true }
          )
        : await TzuratSubmission.findOne({ _id: candidate._id, status: 'approved' }).lean();
      if (!sub) continue;
      if (onSubmission) await onSubmission(sub._id);
      const page = await pageOf(sub.page);
      if (want.has('anchor')) for (const r of anchorRows(sub, page)) yield r;
      if (want.has('check')) for (const r of checkRows(sub, page)) yield r;
    }
  }
  if (want.has('report')) {
    const pageOf = pageCache();
    const q = TzuratReport.find(sinceFilter(since)).sort({ _id: 1 }).lean();
    for await (const r of cursorOf(q)) yield reportRow(r, await pageOf(r.page));
  }
  if (want.has('contributor')) {
    for (const c of await contributors()) yield contributorRow(c);
  }
}
