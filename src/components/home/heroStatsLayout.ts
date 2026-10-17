// פריסת שורת המספרים בגיבור במסך צר (narrow, מתחת ל-25rem — ראו layout.css) — לוגיקה טהורה.
//
// במסך רחב כל הפריטים בשורה אחת. במסך צר חמישה פריטים בשורה אחת נדחסים, ולכן מארבעה פריטים
// ומעלה הם נשברים לשתי שורות מאוזנות: השורה העליונה מלאה (ceil(n/2) — 3 מתוך 5, 2 מתוך 4)
// והתחתונה ממורכזת מתחתיה, כך שהרוחב של כל פריט זהה בשתיהן.

/** ממספר הפריטים הזה ומעלה — שתי שורות במסך צר. */
export const NARROW_WRAP_FROM = 4

/** כמה פריטים בכל שורה במסך צר (ברוחב שווה). */
export function narrowColumns(count: number): number {
  if (count <= 0) return 1
  return count >= NARROW_WRAP_FROM ? Math.ceil(count / 2) : count
}

/** האם הפריט פותח שורה במסך צר — לפריט כזה אין קו הפרדה בצדו. */
export function startsNarrowRow(index: number, count: number): boolean {
  return index % narrowColumns(count) === 0
}
