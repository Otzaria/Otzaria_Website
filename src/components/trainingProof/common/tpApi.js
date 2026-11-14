// קריאה ל-/api/training-proof שמחזירה גם את קוד-הסטטוס — הדפים מבחינים בין 403
// ("אין לך הרשאת גישה", עם access) לבין שגיאה אחרת. לא זורקת: {ok, status, data}.
//
// חיבור שפג: השער של האתר (proxy) מפנה בקשה בלי התחברות לדף ההתחברות, ו-fetch עוקב
// אחרי ההפניה ומקבל HTML ב-200. זה לא "הצליח": תשובה שאינה JSON או שהופנתה = 401.
export const EXPIRED = 'החיבור לאתר פג — רעננו את הדף והתחברו מחדש. מה שכבר נשמר — נשמר.'

export async function tpFetch(url, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    const json = (res.headers.get('content-type') || '').includes('application/json')
    if (res.redirected || !json) return { ok: false, status: 401, data: { error: EXPIRED } }
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'אין חיבור לאתר — בדקו את החיבור לאינטרנט' } }
  }
}

// יציאה מהדף: בקשה שהדפדפן שולח גם כשהדף נסגר (sendBeacon), עם נפילה ל-fetch keepalive
export function beacon(url, body) {
  const json = JSON.stringify(body)
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(url, new Blob([json], { type: 'text/plain' }))) return
  } catch {
    // נפילה ל-fetch
  }
  fetch(url, { method: 'POST', body: json, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {})
}
