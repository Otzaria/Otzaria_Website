// התחלת עבודת OCR מקומי (method=local) מהדיאלוג — לוגיקה בלי React/DOM:
// - requestId: מזהה אידמפוטנטיות ללחיצה. נשמר (ref + sessionStorage) לניסיונות החוזרים של אותה
//   בקשה — גם לחיצה חוזרת אחרי תקלת רשת/timeout שולחת אותו מזהה, כך שהשרת ממשיך את אותה עבודה
//   ולא יוצר כפילות. מתחדש כשמשנים פרמטרים (ספק/טיפול בעמודים ערוכים/אפשרויות), אחרי הצלחה,
//   ואחרי תשובה סופית שאין טעם לחזור עליה (400/409/413/422 וכו').
// - classifyStartResponse: תשובת השרת → started / retry / error (עם הודעה בעברית).
// - postLocalStart: שליחה עם ניסיון חוזר אוטומטי (רשת, 502/503/504, 409 preparing), ניתנת לביטול
//   (AbortSignal) — הדיאלוג מבטל בסגירה, כך שהלולאה לא ממשיכה לשלוח אחרי שנסגר.
import { TERMINAL_STATUSES, isActiveStatus } from '@/lib/ocr/localJobState'

export const START_URL = '/api/admin/books/ocr/start'
export const START_RETRY_ATTEMPTS = 6
export const START_RETRY_DELAY_MS = 5000
const STORE_PREFIX = 'ocr-local-request:'

/** מזהה בקשה חדש — randomUUID (גם בהקשר לא מאובטח: נפילה ל-getRandomValues) */
export function newRequestId(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof cryptoImpl?.getRandomValues === 'function') cryptoImpl.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** מפתח הפרמטרים שה-requestId קשור אליהם (אותו requestId לפרמטרים אחרים → 409 בשרת) */
export function localParamsKey({ bookId, existingTextMode, options }) {
  return JSON.stringify([String(bookId), existingTextMode || '', options?.lm || '', options?.defaultScript || ''])
}

// sessionStorage עלול להיות חסום/לזרוק (חלון פרטי, הגדרות) — אז נשענים על ה-ref בלבד
export function loadRequestId(store, bookId, paramsKey) {
  try {
    const raw = store?.getItem(STORE_PREFIX + bookId)
    if (!raw) return null
    const saved = JSON.parse(raw)
    return saved && saved.paramsKey === paramsKey && typeof saved.id === 'string' ? saved.id : null
  } catch {
    return null
  }
}

export function saveRequestId(store, bookId, paramsKey, id) {
  try {
    store?.setItem(STORE_PREFIX + bookId, JSON.stringify({ id, paramsKey }))
  } catch {
    // אין אחסון — ה-ref מספיק לניסיונות באותו חלון
  }
}

export function clearRequestId(store, bookId) {
  try {
    store?.removeItem(STORE_PREFIX + bookId)
  } catch {
    // ראו למעלה
  }
}

const MAX_PAGE_NUMBERS_SHOWN = 15

function withPageNumbers(message, pageNumbers) {
  if (!Array.isArray(pageNumbers) || pageNumbers.length === 0) return message
  const shown = pageNumbers.slice(0, MAX_PAGE_NUMBERS_SHOWN).join(', ')
  const more = pageNumbers.length > MAX_PAGE_NUMBERS_SHOWN ? ` ועוד ${pageNumbers.length - MAX_PAGE_NUMBERS_SHOWN}` : ''
  return `${message} (עמודים: ${shown}${more})`
}

const TERMINAL_202_MESSAGES = Object.freeze({
  failed: 'העבודה של הבקשה הזו כבר נכשלה ולא התחילה. אפשר להתחיל עבודה חדשה',
  cancelled: 'העבודה של הבקשה הזו בוטלה ולא התחילה. אפשר להתחיל עבודה חדשה',
  completed: 'העבודה של הבקשה הזו כבר הסתיימה',
})

const error = (message, { keepRequestId = false, refresh = true } = {}) => ({ kind: 'error', message, keepRequestId, refresh })
const retry = (message) => ({ kind: 'retry', message })

/**
 * @param {number} status סטטוס HTTP, או 0 לתקלת רשת
 * @param {any} body גוף ה-JSON (או {} אם לא JSON — למשל דף שגיאה של nginx)
 * @returns {{kind:'started', jobId?:string, status?:string}
 *   | {kind:'retry', message:string}
 *   | {kind:'error', message:string, keepRequestId:boolean, refresh:boolean}}
 */
export function classifyStartResponse(status, body) {
  const b = body && typeof body === 'object' ? body : {}
  const serverMsg = typeof b.error === 'string' && b.error ? b.error : ''

  if (!status) return retry('תקלה בתקשורת עם השרת')

  if ((status === 202 || status === 200) && b.success) {
    // 202 אידמפוטנטי לעבודה שכבר נסגרה (נכשלה/בוטלה) — אינו "התחיל"
    if (TERMINAL_STATUSES.includes(b.status)) {
      return error(TERMINAL_202_MESSAGES[b.status])
    }
    if (b.status === undefined || isActiveStatus(b.status)) {
      return { kind: 'started', jobId: b.jobId, status: b.status }
    }
    return error('השרת החזיר מצב עבודה לא מוכר')
  }

  switch (status) {
    case 400:
      return error(serverMsg || 'הבקשה אינה תקינה', { refresh: false })
    case 401:
      return error('יש להתחבר מחדש כדי להפעיל OCR', { refresh: false })
    case 403:
      return error('אין לך הרשאה להפעיל OCR', { refresh: false })
    case 409:
      if (b.code === 'preparing') return retry(serverMsg || 'הבקשה עדיין בהכנה')
      return error(serverMsg || 'כבר קיימת עבודת OCR פעילה לספר הזה')
    case 413:
      return error(serverMsg || 'הספר גדול מדי לעיבוד במחשב המקומי')
    case 422:
      return error(withPageNumbers(serverMsg || 'חלק מתמונות העמודים אינן תקינות לעיבוד', b.pageNumbers))
    case 500:
      // preparation_retry: העבודה נשארה בהכנה — לחיצה חוזרת עם אותו requestId ממשיכה אותה
      return error(serverMsg || 'שגיאת שרת. אפשר לנסות שוב', { keepRequestId: true })
    case 503:
      if (b.code === 'local_not_configured') {
        return error(serverMsg || 'ספק המחשב המקומי אינו מוגדר בשרת', { refresh: false })
      }
      return retry(serverMsg || 'השרת עמוס או לא זמין כרגע')
    case 502:
    case 504:
      return retry('השרת לא הגיב בזמן')
    default:
      return error(serverMsg || `שגיאה בהפעלת העבודה (${status})`, { keepRequestId: true })
  }
}

// המתנה שמסתיימת מוקדם אם הבקשה בוטלה (סגירת הדיאלוג) — בלי טיימר שנשאר תלוי
function sleepMs(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

const ABORTED = Object.freeze({ kind: 'aborted' })

/**
 * שולח את בקשת ה-start, ובמקרה זמני (רשת, 502/503/504, 409 preparing) חוזר עד `attempts` פעמים
 * נוספות כל `delayMs`, תמיד עם אותו payload (ואותו requestId). timeout של nginx בזמן בניית PDF
 * גדול לא יוצר כך עבודה כפולה — הניסיון הבא ממשיך את אותה בקשה בשרת.
 * signal (AbortSignal): ביטול — למשל סגירת הדיאלוג. הבקשה שבדרך נקטעת, אין ניסיונות חוזרים נוספים,
 * והתוצאה {kind:'aborted'} (הקורא לא מעדכן state). ההכנה בשרת, אם התחילה, נמשכת — ופתיחה
 * מחדש של הדיאלוג תראה את העבודה (או תמשיך אותה באותו requestId השמור).
 */
export async function postLocalStart({
  payload,
  fetchImpl = globalThis.fetch,
  attempts = START_RETRY_ATTEMPTS,
  delayMs = START_RETRY_DELAY_MS,
  sleep = sleepMs,
  onRetry,
  signal,
}) {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) return ABORTED
    let status = 0
    let body = {}
    try {
      const res = await fetchImpl(START_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        ...(signal ? { signal } : {}),
      })
      status = Number(res?.status) || 0
      body = await res.json().catch(() => ({}))
    } catch {
      status = 0
    }
    if (signal?.aborted) return ABORTED
    const result = classifyStartResponse(status, body)
    if (result.kind !== 'retry') return result
    if (attempt >= attempts) {
      return error(
        `${result.message}. אפשר ללחוץ שוב — הבקשה תימשך מאותה נקודה ולא תיווצר עבודה כפולה`,
        { keepRequestId: true }
      )
    }
    onRetry?.(attempt + 1, attempts)
    await sleep(delayMs, signal)
  }
}
