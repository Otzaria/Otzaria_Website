// עריכה אחרי אישור — רק מנהל (docs/63 §5): "פתח מחדש לעריכה" לעמוד מאושר. הכללים הטהורים (בלי מסד); הכתיבה — reopen.js;
// הראוט — api/admin/page-proof/books/[gid]/reopen (session של מנהל OCR, או מפתח-גישה עם הרשאת review).
//
// "סבב" (round) של העמוד: כל פתיחה-מחדש מוסיפה 1 (עמוד בלי השדה — 0), וכל הגשה נרשמת בסבב שבו נעשתה. כך ההגשות
// המאושרות נשארות בהיסטוריה (status 'approved') אבל אינן "ההגשה הנוכחית" של העמוד: המונים מתאפסים, מי שהגיש בסבב
// הקודם יכול לתפוס אותו שוב, ובקובץ-התיקונים ההגשה של הסבב החדש היא הראשית (fixesExport.pickPrimary — הסבב הגבוה קודם).
// מי שתופס עמוד שנפתח מחדש מתחיל מהגרסה המאושרת, מסומנת (serverDrafts — כמו הבודק השני). האישור הבא — שוב בידי מנהל.

import { revisionFilter, storedRevision } from './importRules.js';

const validRound = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

// הסבב של עמוד או של הגשה (בלי השדה — 0)
export const roundOf = (x) => validRound(x?.round);
export const sameRound = (a, b) => roundOf(a) === roundOf(b);

// מסנן-Mongo "בסבב r" — סבב 0 תופס גם מסמך בלי השדה (כמו importRules.revisionFilter)
export function roundFilter(r) {
  const n = validRound(r);
  return n === 0 ? { round: { $in: [0, null] } } : { round: n };
}

// מסנן-Mongo "בסבב קודם ל-r" (גם מסמך בלי השדה, כשהוא 0)
export function earlierRoundFilter(r) {
  return { $or: [{ round: { $lt: validRound(r) } }, { round: null }] };
}

export const REOPEN_MSG = Object.freeze({
  recut: 'העמוד ממתין לזיהוי-מחדש — אין מה לפתוח',
  open: 'העמוד כבר פתוח לעריכה',
  pending: 'לעמוד יש הגשה שעוד לא אושרה — אשרו או דחו אותה קודם',
  notApproved: 'העמוד אינו מאושר',
  missing: 'העמוד לא נמצא בספר',
  ids: 'רשימת עמודים לא תקינה',
  book: 'הספר לא נמצא',
});

// למה אי אפשר לפתוח את העמוד מחדש (או null): רק עמוד מאושר — הושלם (done) וכל ההגשות הנדרשות אושרו
export function reopenRefusal(page) {
  if (!page) return REOPEN_MSG.missing;
  if (page.status === 'recut') return REOPEN_MSG.recut;
  if (page.status !== 'done') return (page.activeCount || 0) > 0 ? REOPEN_MSG.pending : REOPEN_MSG.open;
  if ((page.approvedCount || 0) < (page.required || 1)) return REOPEN_MSG.pending;
  return null;
}

// מסנן-Mongo תואם לעדכון האטומי (אם בינתיים השתנה — לא חל)
export function reopenFilter(page) {
  return {
    _id: page._id,
    status: 'done',
    ...revisionFilter(storedRevision(page)),
    ...roundFilter(roundOf(page)),
    $expr: { $gte: ['$approvedCount', { $ifNull: ['$required', 1] }] },
  };
}

// העמוד אחרי פתיחה-מחדש: פתוח, בלי מונים ומגישים (ההגשות נשארות בהיסטוריה), בלי תפיסה; הסבב עולה. מספר הבודקים הדרוש
// (required) נשאר כשהיה — עמוד כפול נשאר כפול גם בסבב החדש
export function reopenUpdate(reviewer = {}, now = new Date()) {
  return {
    $set: {
      status: 'open',
      activeCount: 0,
      approvedCount: 0,
      submitters: [],
      leasedBy: null,
      leasedUntil: null,
      reopenedAt: now,
      reopenedByName: String(reviewer.name || ''),
    },
    $inc: { round: 1 },
  };
}

// נוסח חלון-האישור בניהול
export function reopenMessage(page) {
  return `לפתוח מחדש לעריכה את עמוד ${page?.page}?\nהעמוד יחזור להיות פתוח למתנדבים. ההגשות שאושרו נשארות בהיסטוריה, ומי שיתפוס את העמוד יתחיל מהגרסה שאושרה — השינויים שבה מסומנים. האישור הבא — שוב בידי מנהל.`;
}
