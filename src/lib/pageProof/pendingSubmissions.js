import mongoose from 'mongoose';
// נתיבים יחסיים (לא '@/') — כמו claims.js, כדי שטסט-אינטגרציה ירוץ גם עם node:test מול MongoDB אמיתי
import PageProofBook from '../../models/PageProofBook.js';
import PageProofSubmission from '../../models/PageProofSubmission.js';

// "הוגש — ממתין לבדיקת מנהל": ההגשות של המתנדב שעוד לא נבדקו (status 'submitted'), לרשימה ב"העמודים
// שלי". בלי זה עמוד שהוגש נעלם מהרשימה ברגע שכל הרצף שלו הוגש, והמתנדבים כתבו בפורום שהעמוד "תקוע"
// ואין להם מושג מה קורה איתו (2026-10-05). קריאה בלבד.
//
// הגשה אינה תופסת מקום מחמשת העמודים שהמתנדב מחזיק: ההגשה משחררת את התפיסה (submit — leasedBy:null),
// והמונה של התפיסות (claims.heldCount) סופר רק עמודים פתוחים שהמתנדב *לא* הגיש.
// בקשה לזיהוי-מחדש אינה הגשה (recutRequest) — יש לה רשימה משלה (recutRequests.recutPendingOf).

// כמה הגשות ממתינות מוצגות לכל היותר (הוותיקות קודם — הן אלה שמחכות הכי הרבה)
export const MAX_PENDING_SHOWN = 50;

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// ← [{id (העמוד), submissionId, gid, title, page, submittedAt, revision}] — הוותיקה ראשונה
export async function pendingSubmissionsOf(userId, { limit = MAX_PENDING_SHOWN } = {}) {
  const subs = await PageProofSubmission.find(
    { user: oid(userId), status: 'submitted', recutRequest: { $ne: true } },
    { page: 1, book: 1, gid: 1, pageNo: 1, revision: 1, createdAt: 1 }
  )
    .sort({ createdAt: 1, _id: 1 })
    .limit(Math.max(1, Math.min(MAX_PENDING_SHOWN, Number(limit) || MAX_PENDING_SHOWN)))
    .lean();
  if (!subs.length) return [];
  const books = await PageProofBook.find({ _id: { $in: [...new Set(subs.map((s) => String(s.book)))].map(oid) } }, { title: 1 }).lean();
  const titleOf = new Map(books.map((b) => [String(b._id), b.title]));
  return subs.map((s) => ({
    id: String(s.page),
    submissionId: String(s._id),
    gid: s.gid,
    title: titleOf.get(String(s.book)) || '',
    page: s.pageNo,
    submittedAt: s.createdAt,
    revision: s.revision || 1,
  }));
}
