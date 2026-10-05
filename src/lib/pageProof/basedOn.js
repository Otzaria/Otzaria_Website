import mongoose from 'mongoose';
// נתיבים יחסיים (לא '@/') — כדי שירוץ גם בבדיקות node:test
import PageProofSubmission from '../../models/PageProofSubmission.js';
import { basedOnDelta, sameAsMap } from './draftRules.js';

// הגשה שמבוססת על הגשה קודמת לעמוד (הבודק השני — docs/63 §4; עמוד שמנהל פתח מחדש — §5): מה שהסקירה (באתר ובתוכנת-
// הספר) וקובץ-התיקונים צריכים. ההשוואה — מול הפעולות של ההגשה הקודמת כפי שהן שמורות עכשיו (גם אחרי עריכת-מנהל).
//
// subs — הגשות (lean) עם basedOn/basedOnName/basedOnKind/ops ← Map(מזהה-הגשה → {base, sameAs, added, removed}):
//   base    — {id, userName, status, createdAt, kind} (ההגשה הקודמת; missing — נמחקה)
//   sameAs  — לכל פעולה: "<מזהה-הקודמת>:<מקום שם>" לפעולה זהה, אחרת null (draftRules.sameAsMap) — same_as בקובץ-התיקונים
//   added   — כמה פעולות חדשות מעבר לקודמת; removed — הפעולות של הקודמת שאינן בזו (הוחזרו למקור או הוחלפו)
// withOps — גם base.ops (הפעולות של הקודמת — לסקירה בעורך: מה שהתקבל מסומן, ומה שנוסף — בנפרד)
export async function basedOnOf(subs, { withOps = false } = {}) {
  const list = (subs || []).filter((s) => s?.basedOn && mongoose.Types.ObjectId.isValid(String(s.basedOn)));
  const out = new Map();
  if (!list.length) return out;
  const ids = [...new Set(list.map((s) => String(s.basedOn)))];
  const bases = await PageProofSubmission.find({ _id: { $in: ids } }, { ops: 1, userName: 1, status: 1, createdAt: 1 }).lean();
  const byId = new Map(bases.map((b) => [String(b._id), b]));
  for (const s of list) {
    const b = byId.get(String(s.basedOn));
    const kind = s.basedOnKind === 'approved' ? 'approved' : 'submission';
    if (!b) {
      out.set(String(s._id), { base: { id: String(s.basedOn), userName: s.basedOnName || '', status: null, createdAt: null, kind, missing: true }, sameAs: null, added: 0, removed: [] });
      continue;
    }
    const delta = basedOnDelta(b.ops || [], s.ops || []);
    out.set(String(s._id), {
      base: { id: String(b._id), userName: b.userName || s.basedOnName || '', status: b.status, createdAt: b.createdAt, kind, ...(withOps ? { ops: b.ops || [] } : {}) },
      sameAs: sameAsMap(b._id, b.ops || [], s.ops || []),
      added: delta.added.length,
      removed: delta.removed,
    });
  }
  return out;
}
