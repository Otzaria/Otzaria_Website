/**
 * api-cache — מטמון בזיכרון התהליך עבור נתונים ציבוריים ויקרים לחישוב.
 *
 * נועד ל-endpoints שמריצים aggregation כבד ומחזירים אותה תשובה לכל המשתמשים
 * (סטטיסטיקות, ספירות). בלעדיו כל ביקור באתר מריץ את השאילתה מחדש.
 *
 * המטמון הוא פר-תהליך, לא פר-פריסה: בסביבה מרובת מופעים כל מופע מריץ את
 * השאילתה בעצמו פעם ב-TTL, וכל cold start מתחיל מאפס. זה מקובל לנתונים
 * שממילא מוצגים בקירוב. אין כאן שמירה של מידע פרטי — אין להשתמש בזה לתשובות
 * שתלויות במשתמש.
 */

const store = new Map()

/**
 * מחזיר את הערך מהמטמון, או מייצר אותו ושומר ל-ttlMs.
 * בקשות מקבילות לאותו מפתח מחכות לאותו חישוב (single-flight) ולא מכפילות עבודה.
 *
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<any>} produce
 */
export async function cached(key, ttlMs, produce) {
  const now = Date.now()
  const entry = store.get(key)

  if (entry?.expires > now) return entry.value
  if (entry?.pending) return entry.pending

  const pending = produce().then(
    (value) => {
      store.set(key, { value, expires: Date.now() + ttlMs })
      return value
    },
    (error) => {
      // כשל אינו נשמר במטמון — הבקשה הבאה תנסה שוב.
      store.delete(key)
      throw error
    }
  )

  store.set(key, { pending })
  return pending
}

/** מנקה מפתח (או את הכול) — לשימוש אחרי כתיבה שמשנה את הנתונים. */
export function invalidate(key) {
  if (key === undefined) store.clear()
  else store.delete(key)
}

/**
 * כותרות מטמון ל-API שחסימת השבת חלה עליו.
 *
 * no-store, ולא private+max-age: private אמנם מונע שמירה ב-CDN, אבל הוא כן
 * מרשה לדפדפן לענות מהמטמון המקומי בלי לפנות לשרת — כלומר בלי לעבור בחסימת
 * השבת שב-src/proxy.js. גרסה קודמת של הקובץ הזה השתמשה ב-private והנמקה
 * שגויה שלפיה זה מספיק.
 *
 * ההאטה זניחה: החישוב היקר נשמר ממילא ב-cached() בזיכרון התהליך, ולכן בקשה
 * חוזרת נענית מהזיכרון בלי לגעת ב-DB.
 */
export function shabbatGatedCacheHeaders() {
  return { 'Cache-Control': 'no-store' }
}
