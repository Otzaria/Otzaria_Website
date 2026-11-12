// בקשות מסכי הניהול: הפניה = התחברות שפגה (401), תשובה שאינה JSON — שגיאה, תקרת זמן, הודעת שרת
// בעברית מול אנגלית, 403, ו-requestBlob שלא שומר דף HTML כקובץ.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AdminApiError, SESSION_EXPIRED_MESSAGE, errorMessage, errorToast, loginHref, requestBlob, requestJson, startDownload } from './adminRequest'

const response = ({ status = 200, type = 'basic', redirected = false, contentType = 'application/json', body = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  type,
  redirected,
  headers: new Headers({ 'content-type': contentType }),
  json: async () => body,
  blob: async () => new Blob(['x']),
})

afterEach(() => { vi.restoreAllMocks() })

describe('adminRequest', () => {
  test('בקשת JSON: גוף כ-JSON, redirect ידני, והתשובה חוזרת', async () => {
    global.fetch = vi.fn(async () => response({ body: { success: true, n: 1 } }))
    await expect(requestJson('/api/x', { method: 'POST', body: { a: 1 }, fallback: 'נכשל' })).resolves.toEqual({ success: true, n: 1 })
    const [, init] = global.fetch.mock.calls[0]
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', body: '{"a":1}' })
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  test('keepalive — עובר ל-fetch, עם אותה כתובת, שיטה וגוף; בלי — לא נשלח בכלל', async () => {
    global.fetch = vi.fn(async () => response({ body: { success: true } }))
    await requestJson('/api/x', { method: 'PUT', body: { a: 1 }, fallback: 'נכשל', keepalive: true })
    await requestJson('/api/x', { method: 'PUT', body: { a: 1 }, fallback: 'נכשל' })
    const [[url, withKeepalive], [, without]] = global.fetch.mock.calls
    expect(url).toBe('/api/x')
    expect(withKeepalive).toMatchObject({ method: 'PUT', body: '{"a":1}', keepalive: true })
    expect('keepalive' in without).toBe(false)
  })

  test('הפניה (opaqueredirect / 3xx / redirected) ו-401 — התחברות שפגה', async () => {
    for (const r of [response({ type: 'opaqueredirect', status: 0 }), response({ status: 307 }), response({ redirected: true }), response({ status: 401 })]) {
      global.fetch = vi.fn(async () => r)
      const error = await requestJson('/api/x', { fallback: 'נכשל' }).catch((e) => e)
      expect(error).toBeInstanceOf(AdminApiError)
      expect(error).toMatchObject({ status: 401, sessionExpired: true, message: SESSION_EXPIRED_MESSAGE })
    }
  })

  test('200 עם HTML — לא הצלחה', async () => {
    global.fetch = vi.fn(async () => response({ contentType: 'text/html' }))
    await expect(requestJson('/api/x', { fallback: 'השרת לא החזיר נתונים.' })).rejects.toMatchObject({ message: 'השרת לא החזיר נתונים.' })
  })

  test('הודעת שרת: בעברית — מוצגת; באנגלית — fallback; 403 — אין הרשאה', async () => {
    global.fetch = vi.fn(async () => response({ status: 400, body: { error: 'שם הספר כבר קיים במערכת' } }))
    await expect(requestJson('/api/x', { fallback: 'נכשל' })).rejects.toMatchObject({ message: 'שם הספר כבר קיים במערכת', status: 400 })
    global.fetch = vi.fn(async () => response({ status: 500, body: { error: 'Internal Server Error' } }))
    await expect(requestJson('/api/x', { fallback: 'נכשל' })).rejects.toMatchObject({ message: 'נכשל', status: 500 })
    global.fetch = vi.fn(async () => response({ status: 200, body: { success: false, error: 'x', code: 'busy' } }))
    await expect(requestJson('/api/x', { fallback: 'נכשל' })).rejects.toMatchObject({ code: 'busy' })
    expect(errorMessage(403, 'נכשל', 'שגיאה')).toBe('אין לך הרשאה לפעולה הזו.')
    // 429 — הסבר, לא "נכשל"; הודעת שרת בעברית עדיין גוברת
    expect(errorMessage(429, 'נכשל', 'Too Many Requests')).toBe('יותר מדי פעולות ברצף. חכה רגע ונסה שוב.')
    expect(errorMessage(429, 'נכשל', 'נסה שוב בעוד דקה')).toBe('נסה שוב בעוד דקה')
  })

  test('חסימת השבת (503) — ההסבר שלה, לא המילה shabbat', async () => {
    const message = 'הדף אינו פעיל בשבת ובימים טובים לפי שעון ירושלים'
    global.fetch = vi.fn(async () => response({ status: 503, body: { error: 'shabbat', message } }))
    await expect(requestJson('/api/x', { fallback: 'נכשל' })).rejects.toMatchObject({ status: 503, message })
    global.fetch = vi.fn(async () => response({ status: 503, body: { error: 'shabbat' } }))
    await expect(requestJson('/api/x', { fallback: 'נכשל' })).rejects.toMatchObject({ message: 'השרת עמוס כרגע. נסה שוב בעוד רגע.' })
  })

  test('503 (עומס) — הודעת עומס בעברית, והודעת שרת בעברית עדיין גוברת', () => {
    expect(errorMessage(503, 'נכשל', undefined)).toBe('השרת עמוס כרגע. נסה שוב בעוד רגע.')
    expect(errorMessage(503, 'נכשל', 'שרת ההמרה עמוס. נסה שוב מאוחר יותר.')).toBe('שרת ההמרה עמוס. נסה שוב מאוחר יותר.')
  })

  test('תקרת זמן ואין חיבור — הודעות בעברית', async () => {
    global.fetch = vi.fn(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }) })
    await expect(requestJson('/api/x', { fallback: 'נכשל' })).rejects.toMatchObject({ status: 408, message: 'השרת לא עונה. נסה שוב בעוד רגע.' })
    global.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    await expect(requestJson('/api/x', { fallback: 'נכשל' })).rejects.toMatchObject({ status: 0 })
  })

  test('requestBlob: קובץ — חוזר; דף HTML — שגיאה (לא נשמר כקובץ)', async () => {
    global.fetch = vi.fn(async () => response({ contentType: 'application/pdf' }))
    await expect(requestBlob('/api/pdf', { fallback: 'נכשל' })).resolves.toBeInstanceOf(Blob)
    global.fetch = vi.fn(async () => response({ contentType: 'text/html' }))
    await expect(requestBlob('/api/pdf', { fallback: 'לא הצלחנו להכין את ה-PDF.' })).rejects.toMatchObject({ message: 'לא הצלחנו להכין את ה-PDF.' })
  })

  test('errorToast: הודעת השרת או fallback; התחברות שפגה — עם "התחבר"', () => {
    expect(errorToast(null, 'נכשל')).toMatchObject({ tone: 'error', message: 'נכשל', action: undefined })
    expect(errorToast(new AdminApiError('אין הרשאה', 403), 'נכשל').message).toBe('אין הרשאה')
    expect(errorToast(new AdminApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true }), 'נכשל').action.label).toBe('התחבר')
  })

  test('loginHref חוזר לאותה כתובת', () => {
    window.history.replaceState(null, '', '/library/admin/books?book=1')
    expect(loginHref()).toBe(`/auth/login?callbackUrl=${encodeURIComponent('/library/admin/books?book=1')}`)
  })
})

describe('startDownload — הורדה דרך קישור (משותף לעמודים, להעלאות ולתוספים)', () => {
  test('קישור עם href ושם מוצע, נלחץ פעם אחת ומוסר מהדף', () => {
    const clicks = []
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicks.push({ href: this.getAttribute('href'), download: this.getAttribute('download'), connected: this.isConnected })
    })
    startDownload('/api/admin/pages/download-batch?status=completed', 'all-pages.txt')
    startDownload('/api/plugins/x/download')
    spy.mockRestore()
    expect(clicks).toEqual([
      { href: '/api/admin/pages/download-batch?status=completed', download: 'all-pages.txt', connected: true },
      { href: '/api/plugins/x/download', download: '', connected: true },
    ])
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
