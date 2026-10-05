import mongoose from 'mongoose';
// נתיבים יחסיים (לא '@/') — כדי שטסט-האינטגרציה ירוץ עם node:test מול MongoDB אמיתי
import PageProofBook from '../../models/PageProofBook.js';
import PageProofPage from '../../models/PageProofPage.js';
import PageProofDraft from '../../models/PageProofDraft.js';
import { REOPEN_MSG, reopenFilter, reopenRefusal, reopenUpdate } from './reopenRules.js';

// "פתח מחדש לעריכה" לעמודים מאושרים (docs/63 §5) — הצד שכותב למסד; הכללים — reopenRules.js. רק מנהל: הראוט
// (api/admin/page-proof/books/[gid]/reopen) דורש מנהל OCR, או מפתח-גישה של תוכנת-הספר עם הרשאת review.
// לכל עמוד: מאושר (הושלם וכל ההגשות הנדרשות אושרו) ← פתוח, מונים ומגישים מתאפסים, הסבב עולה; ההגשות המאושרות נשארות.
// טיוטה ישנה של העמוד (אם נשארה) נמחקת — מי שיתפוס אותו מתחיל מהגרסה שאושרה (serverDrafts).
// ← {ok, reopened, pages:[מספרי-עמוד], skipped:[{page, error}]} או {ok:false, status, error}

export const MAX_IDS = 500;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error) => ({ ok: false, status, error });
const FIELDS = { page: 1, status: 1, required: 1, activeCount: 1, approvedCount: 1, revision: 1, round: 1 };

export async function reopenPages(gid, ids, reviewer = {}, now = new Date()) {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS || !ids.every((id) => mongoose.Types.ObjectId.isValid(String(id)))) {
    return fail(400, REOPEN_MSG.ids);
  }
  const book = await PageProofBook.findOne({ gid: String(gid) }, { _id: 1 }).lean();
  if (!book) return fail(404, REOPEN_MSG.book);
  const want = [...new Set(ids.map(String))];
  const pages = await PageProofPage.find({ book: book._id, _id: { $in: want.map(oid) } }, FIELDS).lean();
  const byId = new Map(pages.map((p) => [String(p._id), p]));
  const reopened = [];
  const skipped = [];
  for (const id of want) {
    const p = byId.get(id);
    const why = reopenRefusal(p);
    if (why) {
      skipped.push({ id, page: p?.page ?? null, error: why });
      continue;
    }
    const r = await PageProofPage.updateOne(reopenFilter(p), reopenUpdate(reviewer, now));
    if (!r.matchedCount) {
      skipped.push({ id, page: p.page, error: 'מצב העמוד השתנה בינתיים — טענו מחדש' });
      continue;
    }
    await PageProofDraft.deleteMany({ page: p._id });
    reopened.push(p.page);
  }
  return { ok: true, reopened: reopened.length, pages: reopened.sort((a, b) => a - b), skipped };
}
