// בקשות של מסכי הניהול לשרת — עטיפה דקה מעל fetch, לנקודות הקצה הקיימות (בלי שינוי בהן).
// משותף למסכי הניהול (ספרים, העלאות — uploads/uploadsApi.js מייבא מכאן):
//
// התחברות שפגה: ה-proxy מפנה (307) לדף ההתחברות, ו-fetch רגיל היה עוקב ומקבל 200 עם HTML — כלומר
// "הצלחה" שלא קרתה. לכן redirect: 'manual' (הפניה = התחברות שפגה), ותשובה שאינה JSON — שגיאה.
// לכל בקשה תקרת זמן, כדי ששרת שלא עונה לא ישאיר שלד טעינה לנצח.
// הודעת השרת מוצגת רק כשהיא בעברית (השרת מחזיר לפעמים "Internal Server Error"); אחרת — fallback.

// נתיב יחסי (לא '@/'): הקובץ נטען גם מ-node:test דרך lib/adminAppReportsScreen/appReportsTerms.js
import { loginHref as loginUrl } from '../../../lib/accountMenu.js'

/** תקרת הזמן לבקשה רגילה (מ"ש) */
export const REQUEST_TIMEOUT_MS = 30000

export const SESSION_EXPIRED_MESSAGE = 'פג תוקף ההתחברות. התחבר מחדש ונסה שוב.'

/**
 * לאן שולחים מי שההתחברות שלו פגה — וחוזרים לאותו מקום אחרי ההתחברות. היחיד בניהול; מבנה הכתובת
 * עצמו — מ-lib/accountMenu.js (משותף לתפריט החשבון). fallback — כשאין window (רינדור בשרת).
 */
export function loginHref(fallback = '/library/admin') {
  const back = typeof window === 'undefined' ? fallback : `${window.location.pathname}${window.location.search}`
  return loginUrl(back)
}

/** הודעת שגיאה (useToast) של בקשה שנכשלה; התחברות שפגה — עם כפתור "התחבר" */
export function errorToast(error, fallback) {
  return {
    tone: 'error',
    message: error?.message || fallback,
    action: error?.sessionExpired ? { label: 'התחבר', href: loginHref() } : undefined,
  }
}

export class AdminApiError extends Error {
  /** @param {string} message @param {number} status @param {{ sessionExpired?: boolean, code?: string }} [options] */
  constructor(message, status, { sessionExpired = false, code } = {}) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.sessionExpired = sessionExpired
    this.code = code
  }
}

const HEBREW = /[֐-׿]/

export const TOO_MANY_MESSAGE = 'יותר מדי פעולות ברצף. חכה רגע ונסה שוב.'

/** ההודעה למשתמש: 401 — ההתחברות פגה; 403 — אין הרשאה; 429 — יותר מדי ברצף; הודעת שרת בעברית; אחרת — fallback */
export function errorMessage(status, fallback, serverMessage) {
  if (status === 401) return SESSION_EXPIRED_MESSAGE
  if (status === 403) return 'אין לך הרשאה לפעולה הזו.'
  if (typeof serverMessage === 'string' && HEBREW.test(serverMessage) && serverMessage.length <= 300) return serverMessage
  if (status === 429) return TOO_MANY_MESSAGE
  return fallback
}

/** הודעת השרת מתשובת שגיאה; חסימת השבת (503 {error:'shabbat', message}) — ההסבר שלה ולא המילה 'shabbat' */
export function serverError(data) {
  return data?.error === 'shabbat' ? data?.message : data?.error
}

/**
 * fetch עם הפניה ידנית ותקרת זמן; כשל רשת / זמן / הפניה — AdminApiError.
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} init
 */
export async function send(url, { timeoutMs = REQUEST_TIMEOUT_MS, ...init } = {}) {
  let res
  try {
    res = await fetch(url, { ...init, redirect: 'manual', signal: init.signal ?? AbortSignal.timeout?.(timeoutMs) })
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new AdminApiError('השרת לא עונה. נסה שוב בעוד רגע.', 408)
    if (error?.name === 'AbortError') throw error
    throw new AdminApiError('אין חיבור לשרת. בדוק את החיבור ונסה שוב.', 0)
  }
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400) || res.redirected) {
    throw new AdminApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true })
  }
  if (res.status === 401) throw new AdminApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true })
  return res
}

/** התשובה כ-JSON, או null כשאינה JSON */
async function readJson(res) {
  const isJson = (res.headers?.get?.('content-type') || '').includes('application/json')
  if (!isJson) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * בקשת JSON: גוף כ-JSON (אם יש), תשובה כ-JSON. כשל (סטטוס, success:false, או תשובה שאינה JSON) —
 * AdminApiError עם הודעה בעברית.
 * @param {string} url
 * @param {{ method?: string, body?: unknown, fallback: string, timeoutMs?: number, cache?: RequestCache, keepalive?: boolean }} options
 *   cache — כמו ב-fetch (למשל 'no-store'); בלי — ברירת המחדל של הדפדפן. keepalive — הבקשה שורדת את סגירת הדף
 *   (שליחה ב-pagehide של פעולה שממתינה ל"בטל" — useDeferredActions); אותה כתובת, שיטה וגוף
 */
export async function requestJson(url, { method = 'GET', body, fallback, timeoutMs, cache, keepalive = false }) {
  const res = await send(url, {
    method,
    timeoutMs,
    ...(cache ? { cache } : null),
    ...(keepalive ? { keepalive: true } : null),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await readJson(res)
  if (!res.ok || data?.success === false) {
    throw new AdminApiError(errorMessage(res.status, fallback, serverError(data)), res.status, { code: data?.code })
  }
  if (data === null) throw new AdminApiError(fallback, res.status)
  return data
}

/**
 * הורדת קובץ (blob) — מה שהדפדפן מקבל, אם אינו דף HTML (הפניה שלא זוהתה) ואינו שגיאה.
 * @param {string} url
 * @param {{ fallback: string, timeoutMs?: number }} options
 */
export async function requestBlob(url, { fallback, timeoutMs }) {
  const res = await send(url, { timeoutMs })
  if (!res.ok) {
    const data = await readJson(res)
    throw new AdminApiError(errorMessage(res.status, fallback, serverError(data)), res.status)
  }
  if ((res.headers?.get?.('content-type') || '').includes('text/html')) throw new AdminApiError(fallback, res.status)
  return res.blob()
}

/**
 * הורדה דרך קישור (הדפדפן מוריד בעצמו — בלי לטעון את הקובץ לזיכרון הדף, ותשובת שגיאה מהשרת לא מחליפה את המסך).
 * filename — השם המוצע; '' — השם שהשרת נותן (Content-Disposition).
 * @param {string} href @param {string} [filename]
 */
export function startDownload(href, filename = '') {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** שמירת blob כקובץ בדפדפן */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
