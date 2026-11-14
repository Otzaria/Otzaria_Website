// קריאות מסך הניהול ל-/api/admin/training-proof/* — תשובה {success, ...} או שגיאה בעברית.

export const API = '/api/admin/training-proof'

async function parse(res) {
  const d = await res.json().catch(() => null)
  if (!d) throw new Error(res.status === 504 || res.status === 502 ? 'השרת לא ענה בזמן — נסו שוב' : 'תשובה לא תקינה מהשרת')
  if (!d.success) {
    const e = new Error(d.error || 'הפעולה נכשלה')
    e.data = d
    e.status = res.status
    throw e
  }
  return d
}

export async function getJson(path) {
  return parse(await fetch(`${API}${path}`, { cache: 'no-store' }))
}

export async function sendJson(path, body, method = 'POST') {
  return parse(
    await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  )
}

export async function sendForm(path, form) {
  return parse(await fetch(`${API}${path}`, { method: 'POST', body: form }))
}

export const fmt = (n) => (Number(n) || 0).toLocaleString('he-IL')

export function fmtDate(d) {
  if (!d) return '—'
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  return x.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

// "לפני 5 דק'" — לשורות בסקירה
export function ago(d, now = Date.now()) {
  if (!d) return ''
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000))
  if (s < 60) return 'עכשיו'
  if (s < 3600) return `לפני ${Math.round(s / 60)} דק'`
  if (s < 86400) return `לפני ${Math.round(s / 3600)} שע'`
  return `לפני ${Math.round(s / 86400)} ימים`
}
