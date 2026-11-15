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

/** שתי דרכי האישור — בחירה מפורשת בכפתור (applyToText: false / true בבקשה) */
export const APPROVE_CHOICE_TITLE = 'אם התיקון נכון — מה ייכתב בטקסט העמוד?'
export const APPROVE_CHOICES = Object.freeze({
  keep: Object.freeze({ label: 'אשר והשאר בסוגריים', hint: 'המוסכמה המקובלת: הטקסט שבספר נשאר, והתיקון לידו.' }),
  replace: Object.freeze({ label: 'אשר והחלף בתיקון', hint: 'בטקסט העמוד יופיע רק התיקון.' }),
})

/** מה קורה בדחייה (הטקסט שבספר נכון) */
export const REJECT_HINT = 'דחייה: הסימון נשאר בטקסט כמו שהוא. את הטקסט שבספר אפשר להחזיר אחר כך, ב"החל על הטקסט".'

/** למה אי אפשר להחיל על הטקסט (applyBlockReason) */
export const APPLY_BLOCKED_TEXT = Object.freeze({
  page_busy: 'העמוד בעריכה עכשיו, ולכן אי אפשר לשנות את הטקסט שלו. אפשר להכריע כבר עכשיו, ולהחיל על הטקסט אחרי שהעמוד יסומן כגמור.',
  marker_missing: 'הסימון כבר לא נמצא בטקסט העמוד, ולכן אין מה להחליף.',
  unavailable: 'אי אפשר לשנות את טקסט העמוד כרגע.',
})

/** מה יקרה ב"החל על הטקסט" (דיווח שכבר הוכרע) */
export function applyLaterHint(status) {
  return status === 'rejected'
    ? 'הסימון בטקסט יוחלף בטקסט שבספר.'
    : 'הסימון בטקסט יוחלף בתיקון המוצע.'
}

/** מה כבר נעשה בטקסט העמוד */
export function appliedText(appliedToText) {
  if (appliedToText === 'proposed') return 'התיקון הוחל על טקסט העמוד'
  if (appliedToText === 'original') return 'בטקסט העמוד הוחזר הטקסט שבספר'
  return ''
}

/** עריכת הנוסח לפני האישור */
export const EDIT_TOGGLE_LABEL = 'ערוך את הנוסח'
export const EDIT_HINT = 'אפשר לתקן את מה שהמדווח כתב. האישור ישתמש בנוסח שלך, והנוסח של המדווח יישמר.'
export const MARKER_STALE_TEXT = 'הסימון בטקסט עדיין בנוסח של המדווח.'
export const KEEP_EDITED_BUSY_HINT = 'העמוד בעריכה עכשיו: ההכרעה תישמר, ואת הסימון בטקסט אפשר לעדכן לנוסח שלך אחרי שהעמוד יסומן כגמור.'

/** הסבר כשהוכרע ולא הוחל: הסימון עדיין בטקסט */
export const NOT_APPLIED_TEXT = 'הסימון נשאר בטקסט העמוד.'

export const NOT_FOUND_TEXT = 'ההחלטה נשמרה, אבל הסימון לא נמצא בטקסט העמוד — הטקסט לא השתנה.'

/** הודעה אחרי פעולה מוצלחת */
export function doneToast(action, report, applyResult = null) {
  const name = reportName(report)
  const applied = applyResult === 'applied'
  switch (action) {
    case 'approve':
      if (applyResult === 'marker_updated') return `התיקון אושר, והסימון בטקסט עודכן לנוסח שלך — ${name}`
      return applied ? `התיקון אושר והוחל על הטקסט — ${name}` : `התיקון אושר, והסימון נשאר בסוגריים — ${name}`
    case 'reject':
      return applied ? `התיקון נדחה, והטקסט שבספר הוחזר — ${name}` : `התיקון נדחה, והסימון נשאר בטקסט — ${name}`
    case 'apply':
      return applyResult === 'marker_updated' ? `הסימון בטקסט עודכן לנוסח שהוחלט — ${name}` : `ההחלטה הוחלה על הטקסט — ${name}`
    case 'handled':
      return `ההודעה סומנה כטופלה — ${name}`
    case 'reopen':
      return `הדיווח חזר לממתינים — ${name}`
    default:
      return 'נשמר'
  }
}

/** הודעת שגיאה כשאין הודעה מהשרת */
export function failText(action) {
  switch (action) {
    case 'approve': return 'לא הצלחנו לאשר את התיקון. נסה שוב.'
    case 'reject': return 'לא הצלחנו לדחות את התיקון. נסה שוב.'
    case 'apply': return 'לא הצלחנו להחיל על הטקסט. נסה שוב.'
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

export const KEYBOARD_HINT = 'במקלדת: J / K (או ↑ ↓) בין הכרטיסים, A — אשר והשאר בסוגריים, R — דחה.'
