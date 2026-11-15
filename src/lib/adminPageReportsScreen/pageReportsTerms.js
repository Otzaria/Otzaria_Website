// "דיווחים על עמודים" — הניסוח של המסך: שמות, מצבים, הסברים והודעות. לוגיקה טהורה (נבדק ב-pageReportsTerms.test.mjs).
// עברית פשוטה: "ממתין" ולא "בתור", "מצב" ולא "סטטוס".

import { formatNumber } from '../adminTerms.js'
import { adminScreenTitle } from '../adminNav.js'

export const PAGE_REPORTS_TITLE = adminScreenTitle('page-reports')
export const PAGE_REPORTS_DESCRIPTION = 'טעויות שנמצאות בספר המודפס עצמו (כפי שהן מופיעות בצילום, לא טעויות זיהוי), עם התיקון שהמתנדבים מציעים; והודעות שכתבו לכם על עמודים.'

export const TAB_LABELS = Object.freeze({ book_error: 'טעויות בספר המודפס', message: 'הודעות על עמודים' })
export const STATUS_LABELS = Object.freeze({ pending: 'ממתין', approved: 'אושר', rejected: 'נדחה', handled: 'טופל', all: 'הכול' })
export const PAGE_STATUS_LABELS = Object.freeze({ 'in-progress': 'בטיפול', completed: 'הושלם', available: 'פנוי' })

/** "דיווח אחד" / "12 דיווחים" */
export function reportsCountText(n) {
  return n === 1 ? 'דיווח אחד' : `${formatNumber(n)} דיווחים`
}

/** השם הנגיש של המונה בלשונית: "3 ממתינים" / "אחד ממתין" */
export function pendingCountLabel(n) {
  return n === 1 ? 'אחד ממתין' : `${formatNumber(n)} ממתינים`
}

/** תווית אפשרות מצב בסינון, עם המונה: "ממתין 4" */
export function statusOptionLabel(status, count) {
  return `${STATUS_LABELS[status] || status} ${formatNumber(count)}`
}

/** "עמוד 12" */
export const pageLabel = (pageNumber) => `עמוד ${pageNumber}`

/** השם של הדיווח לקורא מסך ולתוויות כפתורים: "בראשית רבה, עמוד 12" */
export function reportName(report) {
  return `${report?.bookName || report?.bookPath || 'ספר'}, ${pageLabel(report?.pageNumber ?? '')}`
}

/** מה כבר נעשה בטקסט העמוד */
export function appliedText(appliedToText) {
  if (appliedToText === 'proposed') return 'התיקון הוחל על טקסט העמוד'
  if (appliedToText === 'original') return 'בטקסט העמוד הוחזר הטקסט שבספר'
  return ''
}

export const EDIT_HINT = 'הנוסח יישמר בדיווח בלבד; טקסט העמוד לא ישתנה.'

/** הודעה אחרי פעולה מוצלחת */
export function doneToast(action, report) {
  const name = reportName(report)
  switch (action) {
    case 'approve': return `התיקון אושר; טקסט העמוד לא השתנה — ${name}`
    case 'reject': return `התיקון נדחה; טקסט העמוד לא השתנה — ${name}`
    case 'handled': return `ההודעה סומנה כטופלה — ${name}`
    case 'reopen': return `הדיווח חזר לממתינים — ${name}`
    default: return 'נשמר'
  }
}

/** הודעת שגיאה כשאין הודעה מהשרת */
export function failText(action) {
  switch (action) {
    case 'approve': return 'לא הצלחנו לאשר את התיקון. נסה שוב.'
    case 'reject': return 'לא הצלחנו לדחות את התיקון. נסה שוב.'
    case 'handled': return 'לא הצלחנו לסמן את ההודעה כטופלה. נסה שוב.'
    case 'reopen': return 'לא הצלחנו לפתוח את הדיווח מחדש. נסה שוב.'
    default: return 'הפעולה לא הצליחה. נסה שוב.'
  }
}

/** ריק: לפי לשונית ומצב */
export function emptyText(kind, status, book) {
  const where = book ? ' בספר הזה' : ''
  if (status === 'pending') {
    return kind === 'message'
      ? { title: `אין הודעות שממתינות${where}`, description: 'כשמתנדב יכתוב לכם הודעה על עמוד, היא תופיע כאן.' }
      : { title: `אין טעויות שממתינות${where}`, description: 'כשמתנדב ידווח על טעות שנמצאת בספר המודפס עצמו, היא תופיע כאן.' }
  }
  return { title: `אין דיווחים כאלה${where}`, description: 'נסה מצב אחר, או את כל הספרים.' }
}

export const KEYBOARD_HINT = 'במקלדת: J / K (או ↑ ↓) בין הכרטיסים, A — אשר, R — דחה.'
