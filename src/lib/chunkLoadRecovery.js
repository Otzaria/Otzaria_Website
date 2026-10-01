// התאוששות מכשל בטעינת chunk של רכיב שנטען עצלית (next/dynamic).
//
// טאב שנפתח לפני דפלוי מבקש chunks שכבר נמחקו מהשרת (404). בלי טיפול, הכשל
// מפיל את כל הדף ל-error boundary. במקום זה: טעינה מלאה של הדף (שמביאה את
// ה-HTML וה-chunks העדכניים). כדי לא להיכנס ללופ רענון כשהכשל אינו זמני, רענון
// נוסף בתוך חלון קצר אחרי הקודם אינו מתבצע — והשגיאה ממשיכה כרגיל.

const RELOAD_STORAGE_KEY = 'otzaria:chunk-reload-at'
export const CHUNK_RELOAD_WINDOW_MS = 10_000

/**
 * האם לרענן את הדף אחרי כשל בטעינת chunk.
 * @param {number | null} lastReloadAt - מתי בוצע הרענון הקודם מסיבה זו (ms), או null
 * @param {number} now - הזמן הנוכחי (ms)
 * @param {number} [windowMs]
 * @returns {boolean}
 */
export function shouldReloadAfterChunkError(lastReloadAt, now, windowMs = CHUNK_RELOAD_WINDOW_MS) {
  if (typeof lastReloadAt !== 'number' || !Number.isFinite(lastReloadAt)) return true
  return now - lastReloadAt >= windowMs || now < lastReloadAt
}

/**
 * handler ל-.catch של import() דינמי: מרענן את הדף ומחזיר Promise שלא מסתיים
 * (הרכיב נשאר במצב loading עד הרענון), או זורק מחדש כשרענון לא מתאים.
 * @param {unknown} error
 * @returns {Promise<never>}
 */
export function reloadOnChunkError(error) {
  if (typeof window === 'undefined') throw error
  let lastReloadAt = null
  try {
    const stored = Number(window.sessionStorage.getItem(RELOAD_STORAGE_KEY))
    lastReloadAt = stored > 0 ? stored : null
  } catch {
    // sessionStorage חסום — ממשיכים בלי הגנת לופ שמורה
  }
  const now = Date.now()
  if (!shouldReloadAfterChunkError(lastReloadAt, now)) throw error
  try {
    window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now))
  } catch {
    // ראו למעלה
  }
  window.location.reload()
  return new Promise(() => {})
}
