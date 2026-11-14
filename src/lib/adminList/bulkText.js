// הטקסטים המשותפים לפעולה מרובה ברשימות הניהול. כל מסך מחליט על הפועל ("מסתיר", "מאשר"…);
// התבנית — אחת, כדי שכל המסכים ייראו אותו דבר. הסיכום בסוף (bulkResultText) נשאר בכל מסך: הוא
// שונה באמת ממסך למסך (התנגשויות, דילוגים, "כבר נקראו").
import { formatNumber } from '../adminTerms.js'

/**
 * שורת ההתקדמות בזמן פעולה מרובה: "מסתיר… 120 מתוך 2,745".
 * @param {string} verb הפועל בהווה, בלי שלוש נקודות
 * @param {{ done: number, total: number }} progress
 */
export function bulkProgressText(verb, { done, total }) {
  return `${verb}… ${formatNumber(done)} מתוך ${formatNumber(total)}`
}

/**
 * פעולה מרובה שנעצרה בגלל תקלה בשרת (isFatal בלי אובדן הרשאה — lib/adminList/requestErrors): הסיכום הרגיל של
 * המסך (כמה הצליחו, כמה נכשלו / לא נשלחו), ואחריו הסיבה. בלי סיבה — הסיכום כמו שהוא.
 * @param {string} summary @param {{ message?: string } | null | undefined} error
 */
export function withStopReason(summary, error) {
  const reason = error?.message?.trim()
  return reason ? `${summary} ${reason}` : summary
}
