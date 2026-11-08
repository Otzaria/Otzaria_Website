// צורת הדף — קריאות ה-API של מסך הניהול (/api/admin/tzurat-hadaf/**).
// התגובות לפי CONTRACT.md ("צורות התגובה"): JSON, ושגיאה {error, code?} עם סטטוס 4xx/5xx.
// כאן אין `success` כמו בהגהת עמודים — ההצלחה נקבעת לפי res.ok, ותשובה שאינה JSON אינה הצלחה.
// השליחה עצמה — send המשותף (admin/list/adminRequest): הפניה לדף ההתחברות = התחברות שפגה (ולא "הצלחה" עם HTML),
// תקרת זמן, וההודעות בעברית (גם חסימת השבת — לא המילה 'shabbat').

import { AdminApiError, SESSION_EXPIRED_MESSAGE, errorMessage, send } from '@/components/admin/list/adminRequest'

export const API = '/api/admin/tzurat-hadaf'

export const NETWORK_ERROR = 'אין חיבור לשרת. בדוק את החיבור ונסה שוב.'
export const FAILED = 'הפעולה לא הצליחה. נסה שוב בעוד רגע.'
export const BAD_REPLY = 'התשובה מהשרת לא תקינה. רענן את הדף ונסה שוב.'

const readJson = (res) => (typeof res?.json === 'function' ? res.json().catch(() => null) : Promise.resolve(null))

/** הפניה (לדף ההתחברות) או 401 — ההתחברות פגה. ל-fetch שהוזרק (בדיקות, מנוע ההעלאה) — אותו כלל של send. */
export function isSessionExpired(res) {
  return !!res && (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400) || !!res.redirected || res.status === 401)
}

/** ההודעה מתשובת שגיאה: הודעת השרת בעברית, חסימת השבת — ההסבר שלה, ואחרת fallback */
export function replyError(status, data, fallback) {
  const server = data?.error === 'shabbat' ? data?.message : data?.error
  return errorMessage(status, fallback, server)
}

/** fetch שהוזרק — עם redirect ידני ואותה בדיקת התחברות */
async function sendWith(fetchFn, url, init) {
  let res
  try {
    res = await fetchFn(url, { ...init, redirect: 'manual' })
  } catch {
    throw new AdminApiError(NETWORK_ERROR, 0)
  }
  if (isSessionExpired(res)) throw new AdminApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true })
  return res
}

/**
 * בקשה אחת. מחזיר {ok, status, data, error, code, sessionExpired} — לעולם לא זורק.
 * path — יחסי ל-API (למשל 'items?status=disputed') או נתיב מלא שמתחיל ב-/.
 * body — אובייקט (נשלח כ-JSON); method ברירת מחדל GET (או POST כשיש body). timeoutMs — תקרת זמן (ברירת המחדל של send).
 * failMessage — ההודעה כשהשרת נכשל בלי הסבר בעברית (בלי מספר הסטטוס — זה לא אומר כלום למשתמש).
 */
export async function apiCall(path, { method, body, fetchFn, timeoutMs, failMessage = FAILED } = {}) {
  const url = path.startsWith('/') ? path : `${API}/${path}`
  const init = { method: method || (body !== undefined ? 'POST' : 'GET'), cache: 'no-store' }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const fail = (status, error, extra = {}) => ({ ok: false, status, data: null, error, code: null, sessionExpired: false, ...extra })
  let res
  try {
    res = fetchFn ? await sendWith(fetchFn, url, init) : await send(url, { ...init, ...(timeoutMs ? { timeoutMs } : null) })
  } catch (e) {
    if (e instanceof AdminApiError) return fail(e.status, e.status === 0 ? NETWORK_ERROR : e.message, { sessionExpired: !!e.sessionExpired })
    return fail(0, NETWORK_ERROR)
  }
  const data = await readJson(res)
  if (!res.ok) {
    return { ...fail(res.status, replyError(res.status, data, failMessage)), data, code: data?.code || null }
  }
  // 200 בלי JSON (למשל דף HTML) — לא הצלחה
  if (data === null || typeof data !== 'object') return fail(res.status, BAD_REPLY)
  return { ok: true, status: res.status, data, error: null, code: null, sessionExpired: false }
}

/** מחרוזת שאילתה בלי ערכים ריקים (וגם בלי 'all'). */
export function query(params) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '' || v === 'all') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

const round4 = (v) => Math.round(v * 10000) / 10000

/** מוסיף לכתובת תמונה אזור בשברים (x,y,w,h) — החיתוך נעשה בשרת. */
export function withRegion(url, region) {
  if (!url || !region) return url || ''
  const [base, qs = ''] = String(url).split('?')
  const p = new URLSearchParams(qs)
  for (const k of ['x', 'y', 'w', 'h']) {
    const v = Number(region[k])
    if (Number.isFinite(v)) p.set(k, String(round4(v)))
  }
  return `${base}?${p}`
}

/** כתובת תמונת עמוד (scan|ours), אופציונלית עם אזור. */
export function pageImageUrl(pageId, side, region = null) {
  return withRegion(`/api/tzurat-hadaf/pages/${encodeURIComponent(String(pageId || ''))}/image?side=${side}`, region)
}

/** מספר הדפים: מהשרת (pages / pageSize), ואם אין — לפי גודל הדף הראשון. */
export function pageCount(data, firstSize) {
  if (!data) return 1
  if (Number(data.pages) > 0) return Number(data.pages)
  const size = Number(data.pageSize) || Number(firstSize) || 0
  return size > 0 ? Math.max(1, Math.ceil((Number(data.total) || 0) / size)) : 1
}
