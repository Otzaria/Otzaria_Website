import { vi } from 'vitest'

// fetch מדומה לבדיקות הרכיבים של ההגהה לאימון: מפה של "METHOD נתיב" → פונקציה (body) → {status, data}.
// כל קריאה נרשמת ב-calls עם הגוף המפוענח.
export function fakeApi(routes) {
  const calls = []
  const fetchMock = vi.fn(async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase()
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    const body = opts.body ? JSON.parse(opts.body) : undefined
    calls.push({ method, path, body })
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(' ')
      return m === method && (p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : path === p)
    })
    const r = key ? await routes[key](body, path) : { status: 404, data: { error: 'לא נמצא' } }
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      redirected: false,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? r.contentType || 'application/json' : null) },
      json: async () => ({ success: r.status < 300, ...r.data }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export const ocrPublic = (i, extra = {}) => ({
  id: `o${i}`,
  section: 'ocr',
  img: `/api/training-proof/items/o${i}/image`,
  w: 600,
  h: 40,
  alias: 'ספר 4',
  page: 3,
  status: 'held',
  result: null,
  track: i % 2 ? 'square' : 'rashi',
  source: 'ocr',
  text: `שורה מספר ${i}`,
  lineNo: i,
  ctx: null,
  ...extra,
})

export const routerPublic = (i, extra = {}) => ({
  id: `r${i}`,
  section: 'router',
  img: `/api/training-proof/items/r${i}/image`,
  w: 540,
  h: 54,
  alias: 'ספר 7',
  page: 1,
  status: 'held',
  result: null,
  pred: 'rashi',
  predP: 0.8,
  text: '',
  words: null,
  ...extra,
})
