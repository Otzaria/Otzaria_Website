import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import PageProofBook from '@/models/PageProofBook';
import PageProofPage from '@/models/PageProofPage';
import PageProofSubmission from '@/models/PageProofSubmission';
import { hasBookLibraryAccess, hasOcrAccess } from '@/lib/roles';

// עזרי-שרת להגהת-עמודים (/api/page-proof): הרשאה, חלוקת רצפים והחכרה.
// היחידה שמחולקת היא רצף (book+seq) של עד 5 עמודים עוקבים; ההגשה — לעמוד.

// רצף של 5 עמודים מלאים לוקח זמן — החכרה ארוכה, שמתחדשת בכל פתיחת עמוד
export const LEASE_MS = 3 * 60 * 60 * 1000;

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const leaseFree = (now) => [{ leasedUntil: null }, { leasedUntil: { $lt: now } }];

// מאומת, מנהל ספרייה או מנהל OCR. מחזיר {session, userId} או {error}.
export async function requireProofSession() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ success: false, error: 'יש להתחבר' }, { status: 401 }) };
  const u = session.user || {};
  if (!u.isVerified && !hasBookLibraryAccess(u.role) && !hasOcrAccess(u.role)) {
    return {
      error: NextResponse.json({ success: false, error: 'רק משתמשים מאומתים יכולים להגיה עמודים' }, { status: 403 }),
    };
  }
  const userId = u.id || u._id;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return { error: NextResponse.json({ success: false, error: 'מזהה משתמש לא תקין' }, { status: 401 }) };
  }
  return { session, userId: String(userId) };
}

// המזהה שיוצא בשדה who של קובץ-התיקונים: יציב, לא שם
export const whoOf = (userId) => `otz-${String(userId)}`;

// תנאי "העמוד פנוי למשתמש הזה": פתוח, לא הגיש אותו כבר, ולא מוחכר לאחר
function eligibleFor(uid, now) {
  return {
    status: 'open',
    submitters: { $ne: uid },
    $or: [...leaseFree(now), { leasedBy: uid }],
  };
}

async function activeBookIds() {
  const books = await PageProofBook.find({ status: 'active' }, { _id: 1 }).lean();
  return books.map((b) => b._id);
}

// תמונת-מצב של הרצף מנקודת המבט של המשתמש
async function describeSequence(bookId, seq, uid, now) {
  const [book, pages, mine] = await Promise.all([
    PageProofBook.findById(bookId, { gid: 1, title: 1, script: 1 }).lean(),
    PageProofPage.find({ book: bookId, seq }, { page: 1, leasedBy: 1, leasedUntil: 1, submitters: 1, status: 1, lineCount: 1 })
      .sort({ page: 1 })
      .lean(),
    PageProofSubmission.find({ book: bookId, user: uid, status: { $ne: 'rejected' } }, { page: 1, status: 1 }).lean(),
  ]);
  const mineByPage = new Map(mine.map((s) => [String(s.page), s.status]));
  return {
    book: book ? { id: String(book._id), gid: book.gid, title: book.title, script: book.script } : null,
    seq,
    pages: pages.map((p) => {
      const sub = mineByPage.get(String(p._id));
      const leasedToMe = p.leasedBy && String(p.leasedBy) === String(uid) && p.leasedUntil > now;
      return {
        id: String(p._id),
        page: p.page,
        lines: p.lineCount,
        state: sub ? (sub === 'approved' ? 'approved' : 'submitted') : leasedToMe ? 'mine' : 'unavailable',
      };
    }),
  };
}

// הרצף הנוכחי של המשתמש (אם יש לו עמודים מוחכרים שלא הגיש), אחרת רצף חדש.
// skip: "bookId:seq" שהמשתמש דילג עליו עכשיו — לא יוצע שוב באותה בקשה.
export async function claimSequence(userId, skip = null) {
  const uid = oid(userId);
  const now = new Date();

  const held = await PageProofPage.findOne(
    { leasedBy: uid, leasedUntil: { $gt: now }, status: 'open', submitters: { $ne: uid } },
    { book: 1, seq: 1 }
  ).lean();
  if (held) return describeSequence(held.book, held.seq, uid, now);

  const books = await activeBookIds();
  if (!books.length) return null;
  const [skipBook, skipSeq] = String(skip || '').split(':');

  for (let round = 0; round < 4; round++) {
    const match = { ...eligibleFor(uid, now), book: { $in: books } };
    // רוחב לפני עומק: עדיפות לספרים שקיבלו פחות הגשות (הרוחב חשוב לאימון —
    // מסמך 40 §1). בתוך הספר — הרצף הראשון הפנוי.
    const groups = await PageProofPage.aggregate([
      { $match: match },
      { $group: { _id: { book: '$book', seq: '$seq' }, n: { $sum: 1 } } },
      { $sort: { '_id.seq': 1 } },
      { $group: { _id: '$_id.book', first: { $first: '$_id.seq' }, second: { $push: '$_id.seq' } } },
      { $sample: { size: 6 } },
    ]);
    if (!groups.length) return null;

    const counts = await PageProofSubmission.aggregate([
      { $match: { book: { $in: groups.map((g) => g._id) }, status: { $ne: 'rejected' } } },
      { $group: { _id: '$book', n: { $sum: 1 } } },
    ]);
    const countOf = new Map(counts.map((c) => [String(c._id), c.n]));
    groups.sort((a, b) => (countOf.get(String(a._id)) || 0) - (countOf.get(String(b._id)) || 0));

    for (const g of groups) {
      const seqs = g.second.filter((s) => !(String(g._id) === skipBook && String(s) === skipSeq));
      const seq = seqs[0];
      if (seq === undefined) continue;
      const res = await PageProofPage.updateMany(
        { ...eligibleFor(uid, now), book: g._id, seq },
        { $set: { leasedBy: uid, leasedUntil: new Date(now.getTime() + LEASE_MS) } }
      );
      if (res.modifiedCount > 0) return describeSequence(g._id, seq, uid, now);
    }
  }
  return null;
}

// שחרור הרצף (דילוג): כל העמודים שמוחכרים למשתמש
export async function releaseLeases(userId) {
  const uid = oid(userId);
  const res = await PageProofPage.updateMany({ leasedBy: uid }, { $set: { leasedBy: null, leasedUntil: null } });
  return res.modifiedCount;
}

// חידוש ההחכרה של עמוד שנפתח — רק אם הוא עדיין של המשתמש או פנוי
export async function renewLease(pageId, userId) {
  const uid = oid(userId);
  const now = new Date();
  const doc = await PageProofPage.findOneAndUpdate(
    { _id: oid(pageId), ...eligibleFor(uid, now) },
    { $set: { leasedBy: uid, leasedUntil: new Date(now.getTime() + LEASE_MS) } },
    { returnDocument: 'after', lean: true }
  );
  return doc;
}

export async function volunteerStats(userId) {
  const uid = oid(userId);
  const [open, done, mine] = await Promise.all([
    PageProofPage.countDocuments({ status: 'open' }),
    PageProofPage.countDocuments({ status: 'done' }),
    PageProofSubmission.aggregate([
      { $match: { user: uid } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);
  const by = Object.fromEntries(mine.map((m) => [m._id, m.n]));
  return { open, done, mySubmitted: by.submitted || 0, myApproved: by.approved || 0, myRejected: by.rejected || 0 };
}

// צורת העמוד הנשלחת לעורך
export function editorPageShape(p, book) {
  const lines = (p.doc?.lines || []).map(({ polygon, baseline, ...rest }) => rest);
  return {
    id: String(p._id),
    gid: p.gid,
    page: p.page,
    seq: p.seq,
    required: p.required,
    title: book?.title || '',
    script: book?.script || null,
    imageUrl: `/api/page-proof/pages/${p._id}/image`,
    doc: { ...p.doc, lines },
  };
}
