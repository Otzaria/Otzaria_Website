import TrainingProofItem from '@/models/TrainingProofItem';
import TrainingProofBook from '@/models/TrainingProofBook';
import User from '@/models/User';
import { readPageImage } from '@/lib/ocr/images';
import {
  OFFLINE_KIND,
  VIEWER_LABELS,
  VIEWER_COLORS,
  lineParts,
  offlineItem,
  volunteerNames,
  skipReason,
  SKIP_REASONS,
} from '@/lib/trainingProof/offline/contract';
import { htmlHead, htmlData, htmlImage, htmlTail } from '@/lib/trainingProof/offline/html';
import { reviewRevision, reviewRevisionFilter } from '@/lib/trainingProof/reviewVersion';
import { oid } from './http';
import { approveSet, rejectUpdate, routerAgrees, framesChanges } from './rules';
import { fixAndApprove } from './review';

// "אישור בלי אינטרנט" (docs/115) — צד המסד: מה ממתין (וחלוקתו לקבצים), בניית הקובץ בזרם,
// והחלת קובץ-ההחלטות. ההורדה אינה משנה דבר במסד; ההחלה — רק בעדכונים מותנים.

// מה נכנס: ממתין לאישור, ולא באמצע שינוי-זרם (גם באתר אי אפשר לאשר אותו)
const pendingFilter = (section) => ({ section, status: 'submitted', streamChange: null });

// לזיהוי/נתב: {count, parts:[{after,through,count}]}. לגלאי: {count, books:[{book, alias, pages}]}
export async function offlinePlan(section, per) {
  if (section === 'frames') {
    const groups = await TrainingProofItem.aggregate([
      { $match: pendingFilter('frames') },
      { $group: { _id: '$book', n: { $sum: 1 }, alias: { $first: '$payload.alias' } } },
    ]);
    const books = await TrainingProofBook.find({ book: { $in: groups.map((g) => g._id) } }, { book: 1, alias: 1 }).lean();
    const alias = new Map(books.map((b) => [b.book, b.alias]));
    const rows = groups
      .map((g) => ({ book: g._id, alias: alias.get(g._id) || g.alias || g._id, pages: g.n }))
      .sort((a, b) => String(a.alias).localeCompare(String(b.alias), 'he', { numeric: true }));
    return { count: rows.reduce((s, r) => s + r.pages, 0), books: rows };
  }
  const ids = await TrainingProofItem.find(pendingFilter(section), { _id: 1 }).sort({ _id: 1 }).lean();
  return { count: ids.length, parts: lineParts(ids.map((d) => d._id), per) };
}

// הפריטים של קובץ אחד. (after, through] — לזיהוי/נתב; book — לגלאי
async function partDocs(section, { after, through, n, book }) {
  const f = pendingFilter(section);
  if (section === 'frames') {
    f.book = book;
    return TrainingProofItem.find(f).sort({ 'payload.page': 1, _id: 1 }).lean();
  }
  if (after || through) f._id = { ...(after ? { $gt: oid(after) } : {}), ...(through ? { $lte: oid(through) } : {}) };
  // אם נוספו הגשות בתוך הטווח מאז התכנית, לא נחתוך בשקט פריטים שאין להם חלק אחר.
  const docs = await TrainingProofItem.find(f).sort({ _id: 1 }).limit(through ? n + 1 : n).lean();
  // בתוך הקובץ — לפי סדר ההגשה, כמו במסך הסקירה
  return docs.sort((a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0) || String(a._id).localeCompare(String(b._id)));
}

async function namesFor(docs) {
  const ids = [...new Set(docs.map((d) => d.vol).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids.map(oid) } }, { name: 1 }).lean();
  return volunteerNames(users, ids);
}

// הקובץ: מחזיר {fileHead, count, chunks()} — chunks הוא async generator של מחרוזות, כך שהתמונות
// נקראות מהדיסק אחת-אחת בזמן השליחה
export async function buildOffline({ section, offlineId, part, parts, after, through, n, book, ctx, site, now = new Date() }) {
  const docs = await partDocs(section, { after, through, n, book });
  if (section !== 'frames' && through && docs.length > n) return { count: docs.length, overflow: true };
  const names = await namesFor(docs);
  const ctxKeys = new Map();
  const ctxKey = (rel) => {
    if (!ctx || section === 'frames') return null;
    if (!ctxKeys.has(rel)) ctxKeys.set(rel, `c${ctxKeys.size + 1}`);
    return ctxKeys.get(rel);
  };
  const items = docs.map((d) => {
    const it = offlineItem(d, { volName: (id) => names.get(id) || 'מתנדב', ctxKey });
    if (section === 'router') it.agrees = routerAgrees(d.payload, d.result);
    if (section === 'frames') it.changes = d.result ? framesChanges(d.payload?.frames, d.result.frames) : 0;
    return it;
  });
  let bookInfo = null;
  if (section === 'frames') {
    const b = await TrainingProofBook.findOne({ book }, { alias: 1, streams: 1 }).lean();
    bookInfo = { alias: b?.alias || docs[0]?.payload?.alias || '', streams: (b?.streams || []).map((s) => ({ id: s.id, name: s.name, role: s.role })) };
  }
  const data = {
    kind: OFFLINE_KIND,
    offline_id: offlineId,
    section,
    part,
    parts,
    created_at: now.toISOString(),
    site: site || '',
    ctx: !!ctx && section !== 'frames',
    book: bookInfo,
    labels: VIEWER_LABELS,
    colors: VIEWER_COLORS,
    items,
  };
  const title = `אישור בלי אינטרנט — ${VIEWER_LABELS.sections[section]}${bookInfo ? ` · ${bookInfo.alias}` : ''}`;
  async function* chunks() {
    yield htmlHead({ title });
    yield htmlData(data);
    for (const d of docs) yield await imageChunk(`i${d._id}`, d.imagePath);
    for (const [rel, key] of ctxKeys) yield await imageChunk(key, rel);
    yield htmlTail();
  }
  return { count: items.length, chunks };
}

// תמונה שחסרה בדיסק — לא מפילה את ההורדה; החלון מציג "התמונה חסרה בקובץ"
async function imageChunk(key, rel) {
  try {
    const { buffer, mimeType } = await readPageImage(rel);
    return htmlImage(key, mimeType, buffer);
  } catch (e) {
    console.error('training-proof offline image', key, e?.code || e?.message || e);
    return '';
  }
}

// ---------- החלת קובץ-ההחלטות ----------

const SKIP_LIST_MAX = 500;
const BATCH = 25;

function where(doc) {
  const p = doc?.payload || {};
  return { alias: p.alias || '', page: Number.isInteger(p.page) ? p.page : null, line: Number.isInteger(p.line_no) ? p.line_no : null };
}

// decisions — אחרי checkDecisionsFile. מחזיר {approved, fixed, rejected, skipped:{סיבה: n}, skippedList:[…]}
export async function applyDecisions(section, decisions, by, now = new Date()) {
  const docs = await TrainingProofItem.find(
    { _id: { $in: decisions.map((d) => oid(d.id)) } },
    { section: 1, status: 1, submittedAt: 1, reviewRevision: 1, streamChange: 1, vol: 1, 'payload.alias': 1, 'payload.page': 1, 'payload.line_no': 1 }
  ).lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const out = { approved: 0, fixed: 0, rejected: 0, skipped: {}, skippedList: [], total: decisions.length };
  const skip = (dec, reason, doc, error = null) => {
    out.skipped[reason] = (out.skipped[reason] || 0) + 1;
    if (out.skippedList.length < SKIP_LIST_MAX) {
      out.skippedList.push({ id: dec.id, d: dec.d, reason, label: SKIP_REASONS[reason], ...(doc ? where(doc) : {}), ...(error ? { error } : {}) });
    }
  };

  const todo = [];
  for (const dec of decisions) {
    const doc = byId.get(dec.id) || null;
    const reason = skipReason(dec, doc, section);
    if (reason) skip(dec, reason, doc);
    else todo.push({ dec, doc });
  }

  // כל החלטה — עדכון מותנה משלה: עדיין ממתין, אותו זמן-הגשה, (בדחייה) אותו מתנדב
  const one = async ({ dec, doc }) => {
    const cond = { _id: doc._id, section, status: 'submitted', submittedAt: doc.submittedAt, streamChange: null, ...reviewRevisionFilter(doc) };
    if (dec.d === 'approve') {
      const r = await TrainingProofItem.findOneAndUpdate(cond, { $set: approveSet(oid(by), now) }, { projection: { _id: 1 }, lean: true });
      if (r) out.approved++;
      else skip(dec, 'changed', doc);
      return;
    }
    if (dec.d === 'reject') {
      const r = await TrainingProofItem.findOneAndUpdate({ ...cond, vol: doc.vol }, rejectUpdate(doc.vol), { projection: { _id: 1 }, lean: true });
      if (r) out.rejected++;
      else skip(dec, 'changed', doc);
      return;
    }
    const r = await fixAndApprove(dec.id, dec.mark, by, now, null, { expectAt: doc.submittedAt, expectRevision: reviewRevision(doc) });
    if (r.ok) {
      if (r.fixed) out.fixed++;
      else out.approved++;
    } else if (r.status === 400) skip(dec, 'bad-mark', doc, r.error);
    else skip(dec, 'changed', doc);
  };
  for (let i = 0; i < todo.length; i += BATCH) await Promise.all(todo.slice(i, i + BATCH).map(one));
  return out;
}
