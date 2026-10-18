// לוגיקה טהורה לשורה "חינם ← לנצח!" (ForeverTagline).
/**
 * כמה להזיז את "חינם" שמאלה כדי שיהיה ממורכז לבד בתוך השורה "חינם לנצח!" הממורכזת:
 * חצי מהרוחב שנוסף לו בצירוף — "לנצח!" והרווח שביניהם. מעוגל לחצי פיקסל.
 */
export function foreverShift(finalWidth: number, gap: number): number {
  if (!(finalWidth > 0)) return 0
  return Math.round((finalWidth + Math.max(0, gap)) / 2 * 2) / 2
}
