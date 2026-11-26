// עומק קינון של ערך JSON — בדיקה איטרטיבית ודטרמיניסטית (מודול טהור, imports: אין).
//
// למה לא try { JSON.stringify } catch: חריגת RangeError על קינון עמוק תלויה בגרסת V8 ובגודל
// המחסנית. ב-Node 26 (V8 14.6) JSON.stringify כבר לא נכשל גם במאות אלפי רמות, ולכן "שמירה" שנשענה
// על החריגה הפסיקה לשמור — הערך המקונן עבר הלאה (ל-MongoDB, שמגביל קינון ל-100 רמות, ולכל קוד
// רקורסיבי שקורא אותו). כאן הגבול מפורש, זהה בכל גרסה, והבדיקה עצמה אינה רקורסיבית.

const childrenOf = (node) => (Array.isArray(node) ? node : Object.values(node)).values();

/**
 * עומק = מספר המכלים (אובייקט/מערך) המקוננים: פרימיטיב → 0, {} → 1, {a:[1]} → 2.
 * עוצרת מיד כשנמצא מכל בעומק maxDepth+1, כך שגם קלט עוין (או מעגלי) נסרק רק עד הגבול. העבודה
 * לינארית בגודל הקלט (פלט של JSON.parse אינו משתף צמתים).
 * @param {unknown} value ערך כפי שהתקבל מ-JSON.parse
 * @param {number} maxDepth העומק המרבי המותר (מספר שלם ≥ 0)
 * @returns {boolean} true אם יש בערך מכל בעומק גדול מ-maxDepth
 */
export function exceedsJsonDepth(value, maxDepth) {
  if (value === null || typeof value !== 'object') return false;
  if (maxDepth < 1) return true;
  // מחזיקים סמן לכל רמה פעילה; מערך רחב נסרק בלי להעתיק את כל ילדיו למחסנית.
  const stack = [childrenOf(value)];
  while (stack.length > 0) {
    const { value: child, done } = stack[stack.length - 1].next();
    if (done) {
      stack.pop();
      continue;
    }
    if (child === null || typeof child !== 'object') continue;
    if (stack.length + 1 > maxDepth) return true;
    stack.push(childrenOf(child));
  }
  return false;
}
