// "אישור בלי אינטרנט" (docs/115) במסך הניהול — הלוגיקה הטהורה: קישורי-ההורדה מתוך התכנית
// שהשרת מחזיר, וסיכום הדוח שאחרי העלאת קובץ-ההחלטות.

export const OFFLINE_API = '/api/admin/training-proof/offline'

const fmt = (n) => (Number(n) || 0).toLocaleString('he-IL')

// plan = תשובת ?plan=1. מחזיר [{key, label, count, href}] — קישור לכל קובץ
export function downloadLinks(section, plan, { ctx = true } = {}) {
  if (!plan?.offlineId) return []
  const base = `${OFFLINE_API}/download/${section}`
  if (section === 'frames') {
    const books = plan.books || []
    return books.map((b, i) => {
      const q = new URLSearchParams({ oid: plan.offlineId, part: String(i + 1), parts: String(books.length), book: b.book })
      return { key: b.book, label: b.alias, count: b.pages, href: `${base}?${q}` }
    })
  }
  const parts = plan.parts || []
  return parts.map((p, i) => {
    const q = new URLSearchParams({ oid: plan.offlineId, part: String(i + 1), parts: String(parts.length), n: String(plan.per) })
    if (p.after) q.set('after', p.after)
    if (!ctx) q.set('ctx', '0')
    return { key: String(i + 1), label: parts.length > 1 ? `חלק ${i + 1} מתוך ${parts.length}` : 'הקובץ', count: p.count, href: `${base}?${q}` }
  })
}

// הדוח שאחרי ההעלאה: שורת-סיכום, ופירוט הדילוגים לפי סיבה
export function reportSummary(r, labels = {}) {
  if (!r) return { head: '', skips: [] }
  const done = []
  if (r.approved) done.push(`אושרו ${fmt(r.approved)}`)
  if (r.fixed) done.push(`תוקנו ואושרו ${fmt(r.fixed)}`)
  if (r.rejected) done.push(`נדחו ${fmt(r.rejected)}`)
  const skipped = Object.values(r.skipped || {}).reduce((s, n) => s + n, 0)
  const head = `${done.length ? done.join(' · ') : 'לא הוחלה אף החלטה'}${skipped ? ` · דולגו ${fmt(skipped)}` : ''} (מתוך ${fmt(r.total)} בקובץ)`
  const skips = Object.entries(r.skipped || {})
    .filter(([, n]) => n)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => ({ reason, n, label: labels[reason] || reason }))
  return { head, skips }
}

// מקום של פריט בדוח: "ספר 412 · עמ' 17 · שורה 5"
export function placeOf(x) {
  return [x.alias, x.page != null ? `עמ' ${x.page}` : null, x.line != null ? `שורה ${x.line}` : null].filter(Boolean).join(' · ')
}
