// צורת הדף — קריאות ה-API של המתנדב. כל קריאה מחזירה {ok, status, data, error} ואינה זורקת:
// error — הודעה בעברית (מהשרת, או לפי קוד הסטטוס), code — מזהה השגיאה מהשרת (למשל 'closed', 'stale').
import { API } from './labels'

const STATUS_MSG = {
  400: 'הבקשה אינה תקינה',
  401: 'צריך להתחבר מחדש',
  403: 'אין לכם הרשאה לפעולה הזו',
  404: 'לא נמצא',
  409: 'המצב השתנה בינתיים',
  413: 'הבקשה גדולה מדי',
  429: 'יותר מדי בקשות — נסו שוב בעוד רגע',
  503: 'השרת עמוס — נסו שוב בעוד רגע',
}

export function statusMessage(status) {
  return STATUS_MSG[status] || `שגיאת שרת (${status})`
}

/** בקשת JSON. body — אובייקט (נשלח כ-JSON). */
export async function apiJson(url, { method = 'GET', body, keepalive = false, signal } = {}) {
  try {
    const init = { method, cache: 'no-store' }
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' }
      init.body = JSON.stringify(body)
    }
    if (keepalive) init.keepalive = true
    if (signal) init.signal = signal
    const res = await fetch(url, init)
    const data = (await res.json().catch(() => null)) || {}
    if (res.ok) return { ok: true, status: res.status, data, error: null, code: null }
    return { ok: false, status: res.status, data, error: data.error || statusMessage(res.status), code: data.code || null }
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, status: 0, data: {}, error: null, code: 'aborted' }
    return { ok: false, status: 0, data: {}, error: 'אין חיבור לאתר', code: null }
  }
}

export const api = {
  overview: () => apiJson(`${API}/overview`),
  practice: () => apiJson(`${API}/practice`),
  submitPractice: (answers) => apiJson(`${API}/practice`, { method: 'POST', body: { answers } }),
  fast: ({ exclude = [], kind = 'any', stats = false } = {}) => {
    const qs = new URLSearchParams({ kind })
    if (stats) qs.set('stats', '1')
    if (exclude.length) qs.set('exclude', exclude.join(','))
    return apiJson(`${API}/fast?${qs}`)
  },
  answer: (id, body) => apiJson(`${API}/items/${encodeURIComponent(id)}/answer`, { method: 'POST', body }),
  flag: (id, reason) => apiJson(`${API}/items/${encodeURIComponent(id)}/flag`, { method: 'POST', body: { reason } }),
  bookPages: (slug) => apiJson(`${API}/books/${encodeURIComponent(slug)}/pages`),
  claim: (id) => apiJson(`${API}/pages/${encodeURIComponent(id)}/claim`, { method: 'POST', body: {} }),
  release: (id) => apiJson(`${API}/pages/${encodeURIComponent(id)}/release`, { method: 'POST', body: {} }),
  page: (id) => apiJson(`${API}/pages/${encodeURIComponent(id)}`),
  saveDraft: (id, body, opts = {}) => apiJson(`${API}/pages/${encodeURIComponent(id)}/draft`, { method: 'PUT', body, ...opts }),
  submit: (id, body) => apiJson(`${API}/pages/${encodeURIComponent(id)}/submit`, { method: 'POST', body }),
  report: (body) => apiJson(`${API}/reports`, { method: 'POST', body }),
  mine: () => apiJson(`${API}/mine`),
}

const r4 = (v) => Math.round(v * 1e4) / 1e4

/** כתובת חיתוך מתמונת העמוד (side: scan|ours); box — [x, y, w, h] בשברים, או בלי (כל התמונה) */
export function pageImageUrl(pageId, side = 'scan', box = null, { thumb = false, baseUrl } = {}) {
  const [base, search = ''] = (baseUrl || `${API}/pages/${encodeURIComponent(pageId)}/image`).split('?')
  const qs = new URLSearchParams(search)
  qs.set('side', side)
  if (Array.isArray(box) && box.length === 4) {
    qs.set('x', String(r4(box[0])))
    qs.set('y', String(r4(box[1])))
    qs.set('w', String(r4(box[2])))
    qs.set('h', String(r4(box[3])))
  }
  if (thumb) qs.set('thumb', '1')
  return `${base}?${qs}`
}
