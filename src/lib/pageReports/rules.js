// דיווחים על עמודי ספר מצולם (טהור — בלי DB/DOM): שני סוגים —
//   book_error: טעות בספר המצולם עצמו (טעות דפוס במקור). בעורך הטקסט הנבחר הופך לסימון
//               "(הטקסט שבספר)[התיקון המוצע]", והדיווח נשלח למנהלים להכרעה.
//   message:    הודעה חופשית למנהלים על העמוד (בלי קשר לטעות).
// הכרעת המנהל נשמרת בדיווח בלבד; שינוי טקסט מתבצע ידנית בעורך.
import { normalizeCropRect } from './cropRect.js'

export const REPORT_KINDS = Object.freeze(['book_error', 'message'])
export const ERROR_STATUSES = Object.freeze(['pending', 'approved', 'rejected'])
export const MESSAGE_STATUSES = Object.freeze(['pending', 'handled'])
export const ALL_STATUSES = Object.freeze(['pending', 'approved', 'rejected', 'handled'])
export const COLUMNS = Object.freeze(['content', 'right', 'left'])

export const MAX_ORIGINAL = 500
export const MAX_PROPOSED = 500
export const MAX_MESSAGE = 2000
export const MAX_CONTEXT = 120
export const MAX_NOTE = 1000

const BAD_ORIGINAL_CHARS = /[()]/
const BAD_PROPOSED_CHARS = /[[\]]/

/** מחרוזת הסימון שנכנסת לטקסט העמוד */
export function buildErrorMarker(original, proposed) {
  return `(${original})[${proposed}]`
}

const str = (v) => (typeof v === 'string' ? v : '')
const clip = (v, n) => str(v).slice(0, n)

/**
 * הבדיקה של "הטקסט שבספר" ו"התיקון" — אותה לדיווח של מתנדב ולנוסח שמנהל קבע בהכרעה: לא שניהם ריקים, לא זהים,
 * באורך המותר, ובלי סוגריים ששוברים את הסימון (עגולים בטקסט שבספר, מרובעים בתיקון). null — תקין.
 */
export function errorTextsProblem(original, proposed) {
  if (!original.trim() && !proposed.trim()) return 'יש לסמן טקסט או לכתוב תיקון מוצע'
  if (original === proposed) return 'התיקון המוצע זהה לטקסט שבספר'
  if (original.length > MAX_ORIGINAL) return `הטקסט המסומן ארוך מדי (עד ${MAX_ORIGINAL} תווים)`
  if (proposed.length > MAX_PROPOSED) return `התיקון המוצע ארוך מדי (עד ${MAX_PROPOSED} תווים)`
  if (BAD_ORIGINAL_CHARS.test(original)) return 'הטקסט המסומן לא יכול לכלול סוגריים עגולים'
  if (BAD_PROPOSED_CHARS.test(proposed)) return 'התיקון המוצע לא יכול לכלול סוגריים מרובעים'
  return null
}

/** הנוסח שהוחלט: מה שהמנהל קבע (finalOriginal / finalProposed), ואם לא שינה — של המדווח */
export function finalTexts(report) {
  return { original: report?.finalOriginal ?? report?.original ?? '', proposed: report?.finalProposed ?? report?.proposed ?? '' }
}

/**
 * בדיקת קלט של מתנדב שמדווח.
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function normalizeReportInput(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'דיווח לא תקין' }
  const kind = REPORT_KINDS.includes(raw.kind) ? raw.kind : null
  if (!kind) return { ok: false, error: 'סוג הדיווח אינו תקין' }

  const pageNumber = Number(raw.pageNumber)
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) return { ok: false, error: 'מספר העמוד אינו תקין' }
  const bookPath = str(raw.bookPath).trim()
  if (!bookPath) return { ok: false, error: 'חסר מזהה ספר' }

  const message = str(raw.message).trim()
  if (message.length > MAX_MESSAGE) return { ok: false, error: `ההודעה ארוכה מדי (עד ${MAX_MESSAGE} תווים)` }

  if (kind === 'message') {
    if (!message) return { ok: false, error: 'יש לכתוב את תוכן ההודעה' }
    return { ok: true, value: { kind, bookPath, pageNumber, message } }
  }

  const original = str(raw.original)
  const proposed = str(raw.proposed)
  const textError = errorTextsProblem(original, proposed)
  if (textError) return { ok: false, error: textError }

  const column = COLUMNS.includes(raw.column) ? raw.column : 'content'
  const offset = Number.isSafeInteger(raw.offset) && raw.offset >= 0 ? raw.offset : null
  return {
    ok: true,
    value: {
      kind,
      bookPath,
      pageNumber,
      column,
      original,
      proposed,
      offset,
      // ההקשר שלפני — הסוף שלו (הצמוד לטקסט המסומן), לא ההתחלה
      contextBefore: str(raw.contextBefore).slice(-MAX_CONTEXT),
      contextAfter: clip(raw.contextAfter, MAX_CONTEXT),
      message,
      // לא תקין → null (מתעלמים; הדיווח עצמו לא נכשל)
      cropRect: normalizeCropRect(raw.cropRect),
    },
  }
}

/** הקשר סביב טווח בטקסט (לשמירה עם הדיווח) */
export function contextAround(text, start, end, size = 60) {
  const t = str(text)
  return {
    contextBefore: t.slice(Math.max(0, start - size), start),
    contextAfter: t.slice(end, end + size),
  }
}

/**
 * בדיקת הכרעת מנהל.
 * actions: 'approve' | 'reject' (טעות בספר), 'handled' (הודעה), 'reopen' (שניהם),
 *          'apply' (החלה מאוחרת על הטקסט של דיווח שכבר הוכרע ועוד לא הוחל).
 * approve — אפשר גם original + proposed: הנוסח שהמנהל קבע (אותם כללים כמו בדיווח). apply — applyMode 'marker':
 * לעדכן את הסימון שבטקסט לנוסח שהוחלט (בלי להחליף אותו בתיקון).
 * @returns {{ ok: true, value: { action, applyToText, note, edit, applyMode } } | { ok: false, error: string }}
 */
export function normalizeDecision(raw, kind) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'בקשה לא תקינה' }
  const allowed = kind === 'message' ? ['handled', 'reopen'] : ['approve', 'reject', 'reopen', 'apply']
  if (!allowed.includes(raw.action)) return { ok: false, error: 'פעולה לא תקינה' }
  const note = str(raw.note).trim()
  if (note.length > MAX_NOTE) return { ok: false, error: `ההערה ארוכה מדי (עד ${MAX_NOTE} תווים)` }
  const applyToText = kind !== 'message' && (raw.action === 'apply' || raw.applyToText === true)
  // הנוסח שהמנהל קבע (רק באישור): שניהם, או אף אחד
  let edit = null
  if (raw.action === 'approve' && (raw.original !== undefined || raw.proposed !== undefined)) {
    if (typeof raw.original !== 'string' || typeof raw.proposed !== 'string') return { ok: false, error: 'הנוסח המתוקן אינו תקין' }
    const problem = errorTextsProblem(raw.original, raw.proposed)
    if (problem) return { ok: false, error: problem }
    edit = { original: raw.original, proposed: raw.proposed }
  }
  // החלה מאוחרת של סימון בנוסח המנהל (בלי להחליף את הסימון בתיקון)
  const applyMode = raw.action === 'apply' && raw.applyMode === 'marker' ? 'marker' : null
  return { ok: true, value: { action: raw.action, applyToText, note, edit, applyMode } }
}

/** הסטטוס החדש אחרי פעולה */
export function statusAfter(action, currentStatus) {
  if (action === 'approve') return 'approved'
  if (action === 'reject') return 'rejected'
  if (action === 'handled') return 'handled'
  if (action === 'reopen') return 'pending'
  return currentStatus // apply — הסטטוס לא משתנה
}
