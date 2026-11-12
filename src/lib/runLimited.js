// הרצה של פעולה על הרבה פריטים, כמה במקביל (ולא אחד-אחד, ולא הכול בבת אחת) — לפעולות מרובות במסכי
// הניהול, כשאין נקודת קצה מרובה ויוצאת בקשה לכל פריט. לוגיקה טהורה, בלי DOM ובלי React.
//
// עצירה: shouldStop נבדק לפני כל פריט חדש — מה שכבר יצא לדרך מסתיים, ושאר הפריטים לא נשלחים.
// כשל "קטלני" (isFatal — למשל התחברות שפגה): אין טעם להמשיך, ולכן לא נשלחים עוד פריטים.

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => Promise<unknown>} worker
 * @param {{ limit?: number, shouldStop?: () => boolean, isFatal?: (error: any) => boolean,
 *   onProgress?: (progress: { done: number, failed: number, total: number }) => void }} [options]
 * @returns {Promise<{ done: T[], failed: { item: T, error: any }[], fatal: any, stopped: boolean, notAttempted: T[] }>}
 *   done — הצליחו (בסדר הסיום); failed — נכשלו (כולל זה שהכשל שלו קטלני); fatal — הכשל הקטלני הראשון;
 *   stopped — נעצר לבקשת המשתמש; notAttempted — פריטים שלא נשלחו בכלל (בסדר המקורי).
 */
export async function runLimited(items, worker, { limit = 4, shouldStop = () => false, isFatal = () => false, onProgress } = {}) {
  const list = Array.from(items || [])
  const done = []
  const failed = []
  const attempted = new Set()
  let fatal = null
  let stopped = false
  let next = 0

  const lane = async () => {
    while (next < list.length) {
      if (fatal) return
      if (shouldStop()) {
        stopped = true
        return
      }
      const index = next++
      attempted.add(index)
      const item = list[index]
      try {
        await worker(item)
        done.push(item)
      } catch (error) {
        failed.push({ item, error })
        if (isFatal(error) && !fatal) fatal = error
      }
      onProgress?.({ done: done.length, failed: failed.length, total: list.length })
    }
  }

  const lanes = Math.max(1, Math.min(Math.floor(limit) || 1, list.length))
  await Promise.all(Array.from({ length: list.length === 0 ? 0 : lanes }, lane))
  const notAttempted = list.filter((_, i) => !attempted.has(i))
  return { done, failed, fatal, stopped: stopped && notAttempted.length > 0, notAttempted }
}
