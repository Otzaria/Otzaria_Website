// תור בקשות סדרתי — בקשה אחת באוויר בכל רגע, לפי סדר ההגעה. לוגיקה טהורה, בלי React (נבדק ב-serialQueue.test.mjs).
//
// למה: ה-PUT של /api/admin/users כותב תמיד את השם, התפקיד והנקודות מהגוף. שתי בקשות במקביל (מתג צוות
// ו"שמור" של תפקיד) — האחרונה שמגיעה לשרת דורסת את הראשונה. בתור, כל בקשה נבנית (task) רק כשהקודמת
// הסתיימה — ולכן מהערכים השמורים העדכניים, כולל מה שהקודמת שמרה.

/**
 * @returns {{ run: <T>(task: () => Promise<T> | T) => Promise<T>, idle: () => boolean }}
 *   run — מוסיף משימה לסוף התור; ההבטחה שלה נפתרת / נדחית כמו המשימה. כשל של משימה לא עוצר את הבאות.
 *   idle — אין משימה באוויר או ממתינה.
 */
export function createSerialQueue() {
  let tail = Promise.resolve()
  let count = 0
  return {
    run(task) {
      count += 1
      const result = tail.then(() => task())
      const done = () => { count -= 1 }
      tail = result.then(done, done)
      return result
    },
    idle: () => count === 0,
  }
}
