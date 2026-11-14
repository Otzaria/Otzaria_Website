import TrainingProofItem from '@/models/TrainingProofItem';
import TrainingProofBook from '@/models/TrainingProofBook';
import { BOOK_RE } from '@/lib/trainingProof/vocab';
import { adminGate, ok, fail, crash } from '../../_lib/http';
import { namesOf } from '../../_lib/review';
import { adminItem, framesChanges } from '../../_lib/rules';

// סקירת גלאי-האזורים — לפי ספר (docs/75 §2).
// GET            ← {books:[{book, alias, pagesTotal, counts:{available,held,submitted,approved}, vols:[שם], changes, claimedBy}]}
//                   רק ספרים שיש בהם עמוד שסומן (ממתין או מאושר)
// GET ?book=b-…  ← {book:{book, alias, streams, pagesTotal}, pages:[פריט-ניהול לכל עמוד באתר, לפי מספר העמוד]}
export async function GET(request) {
  const { error } = await adminGate();
  if (error) return error;
  try {
    const book = new URL(request.url).searchParams.get('book');
    if (book) {
      if (!BOOK_RE.test(book)) return fail(400, 'מפתח-ספר לא תקין');
      return ok(await bookPages(book));
    }
    return ok({ books: await bookRows() });
  } catch (e) {
    return crash('review frames', e);
  }
}

async function bookRows() {
  const groups = await TrainingProofItem.aggregate([
    { $match: { section: 'frames' } },
    { $group: { _id: { book: '$book', st: '$status' }, n: { $sum: 1 } } },
  ]);
  const byBook = new Map();
  for (const g of groups) {
    const b = g._id.book;
    if (!byBook.has(b)) byBook.set(b, { available: 0, held: 0, submitted: 0, approved: 0 });
    if (g._id.st in byBook.get(b)) byBook.get(b)[g._id.st] = g.n;
  }
  const keys = [...byBook.keys()].filter((b) => byBook.get(b).submitted + byBook.get(b).approved > 0);
  if (!keys.length) return [];
  const [books, marked] = await Promise.all([
    TrainingProofBook.find({ book: { $in: keys } }).lean(),
    TrainingProofItem.find(
      { section: 'frames', book: { $in: keys }, status: 'submitted' },
      { book: 1, vol: 1, 'payload.frames': 1, 'result.frames': 1 }
    ).lean(),
  ]);
  const names = await namesOf([...marked.map((d) => d.vol), ...books.map((b) => b.claimedBy)]);
  return keys
    .map((k) => {
      const b = books.find((x) => x.book === k) || {};
      const mine = marked.filter((d) => d.book === k);
      return {
        book: k,
        alias: b.alias || k,
        pagesTotal: b.pagesTotal || 0,
        counts: byBook.get(k),
        vols: [...new Set(mine.map((d) => names.get(String(d.vol))).filter(Boolean))],
        changes: mine.reduce((n, d) => n + framesChanges(d.payload?.frames, d.result?.frames), 0),
        claimedBy: b.claimedBy && b.claimedUntil && new Date(b.claimedUntil) > new Date() ? names.get(String(b.claimedBy)) || 'מתנדב' : null,
      };
    })
    .sort((a, b) => b.counts.submitted - a.counts.submitted || a.alias.localeCompare(b.alias, 'he'));
}

async function bookPages(book) {
  const [b, docs] = await Promise.all([
    TrainingProofBook.findOne({ book }).lean(),
    TrainingProofItem.find({ section: 'frames', book }).sort({ 'payload.page': 1, _id: 1 }).lean(),
  ]);
  if (!b && !docs.length) return { book: null, pages: [] };
  const names = await namesOf(docs.map((d) => d.vol));
  return {
    book: { book, alias: b?.alias || book, streams: b?.streams || [], pagesTotal: b?.pagesTotal || docs.length, kind: b?.kind || null },
    pages: docs.map((d) => adminItem(d, names)),
  };
}

