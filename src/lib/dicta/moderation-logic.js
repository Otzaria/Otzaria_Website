// לוגיקה טהורה (ללא DB) של תהליך המודרציה על הצעות עריכה (BookEdit).
// מופרד מ-moderation-service.js כדי שניתן יהיה לבדוק ביחידה בלי mongoose/connectDB.

import { applyHunks } from './text-diff.js';

/** סטטוס מקטע, עם תאימות לאחור: מסמכים שנוצרו לפני שדה ה-status → 'pending'. */
export const changeStatus = (c) => c.status || 'pending';

/**
 * מחיל תת-קבוצה של מקטעים על תוכן נתון, מקטע-מקטע, ברצף. פונקציה טהורה —
 * מקבלת תוכן ומחזירה את התוכן החדש + אילו מקטעים הוחלו ואילו התנגשו.
 * @param {string} content תוכן נוכחי (לפני ההחלה)
 * @param {Array<{before:string, after:string}>} subset מקטעים להחלה
 * @returns {{content:string, okChanges:Array, conflictChanges:Array}}
 *   okChanges/conflictChanges הם *אותן רפרנסים* מתוך subset (להשוואת זהות אצל הקורא).
 */
export function applyChangesSequentially(content, subset) {
  let cur = content || '';
  const okChanges = [];
  const conflictChanges = [];
  for (const c of subset) {
    const { content: newContent, conflicts } = applyHunks(cur, [{ before: c.before, after: c.after }]);
    if (conflicts.length) conflictChanges.push(c);
    else { cur = newContent; okChanges.push(c); }
  }
  return { content: cur, okChanges, conflictChanges };
}

/**
 * מחשבת האם הצעת עריכה (לפי מערך changes שלה) נסגרה — כלומר אין בה יותר
 * מקטעים ממתינים — ואם כן, מהו הסטטוס הסופי (approved/rejected) והאם כל
 * המקטעים המאושרים הוחלו בפועל. פונקציה טהורה: אינה משנה את changes,
 * ואינה נוגעת ב-DB.
 * @param {Array<{status?:string, applied?:boolean}>} changes
 * @returns {{remainingPending:number, closed:boolean, finalStatus?:'approved'|'rejected', allApplied?:boolean}}
 */
export function computeEditClosure(changes) {
  const remainingPending = changes.filter((c) => changeStatus(c) === 'pending').length;
  if (remainingPending > 0) return { remainingPending, closed: false };

  const anyApproved = changes.some((c) => c.status === 'approved');
  const finalStatus = anyApproved ? 'approved' : 'rejected';
  const allApplied = changes.every((c) => c.status !== 'approved' || c.applied);
  return { remainingPending, closed: true, finalStatus, allApplied };
}
