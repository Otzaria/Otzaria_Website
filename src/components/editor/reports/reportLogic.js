// דיווחים מעורך העמוד — לוגיקה טהורה (reportLogic.test.js): מה מסומן לדיווח, בניית גוף הבקשה
// והטקסט החדש עם הסימון, ההבדל לתצוגה המקדימה, ופריטי תפריט הלחיצה הימנית.
// הכללים עצמם (ולידציה, צורת הסימון, הקשר) — ב-src/lib/pageReports/rules.js, משותפים לשרת.

import { buildErrorMarker, contextAround, normalizeReportInput, MAX_MESSAGE } from '@/lib/pageReports/rules'
import { hasBooksAccess } from '@/lib/roles'

const SPACE = /\s/
// פיסוק/סמלים בקצות מילה שאינם חלק ממנה (סוגריים, נקודה, פסיק...)
const EDGE = /[\p{P}\p{S}]/u
const LETTER = /[\p{L}\p{N}\p{M}]/u
const QUOTE = /['"׳״]/

/** הטור של שדה העורך לפי data-column: 'right' / 'left', אחרת 'content' */
export function fieldColumn(column) {
  return column === 'right' || column === 'left' ? column : 'content'
}

/**
 * מה ידווח: הבחירה (בלי רווחים בקצוות), ובלי בחירה — המילה שתחת הסמן (בלי פיסוק בקצוות ובלי
 * להיכנס לתגי עיצוב). סמן בתוך תג או ברווח — טווח ריק במקום הסמן.
 * @param {string} value
 * @param {number} selectionStart
 * @param {number} selectionEnd
 * @returns {{ start: number, end: number, text: string }}
 */
export function reportTarget(value, selectionStart, selectionEnd) {
  const v = typeof value === 'string' ? value : ''
  let start = clampIndex(Math.min(selectionStart, selectionEnd), v.length)
  let end = clampIndex(Math.max(selectionStart, selectionEnd), v.length)

  if (start !== end) {
    while (start < end && SPACE.test(v[start])) start++
    while (end > start && SPACE.test(v[end - 1])) end--
    return { start, end, text: v.slice(start, end) }
  }

  if (insideTag(v, start)) return { start, end: start, text: '' }
  const stop = (ch) => ch === undefined || SPACE.test(ch) || ch === '<' || ch === '>'
  let a = start
  let b = start
  while (a > 0 && !stop(v[a - 1])) a--
  while (b < v.length && !stop(v[b])) b++
  // פיסוק בקצוות; גרש/גרשיים בסוף אחרי אות (תוס', ר"ת) — חלק מהמילה
  while (a < b && EDGE.test(v[a]) && !LETTER.test(v[a])) a++
  while (b > a && EDGE.test(v[b - 1]) && !LETTER.test(v[b - 1])) {
    if (QUOTE.test(v[b - 1]) && b - 1 > a && LETTER.test(v[b - 2]) && !QUOTE.test(v[a - 1] ?? '')) break
    b--
  }
  if (a >= b) return { start, end: start, text: '' }
  return { start: a, end: b, text: v.slice(a, b) }
}

function clampIndex(n, len) {
  const x = Number.isFinite(n) ? Math.trunc(n) : 0
  return Math.max(0, Math.min(x, len))
}

// האם pos בתוך תג (<b|>), באותה שורה
function insideTag(v, pos) {
  if (pos <= 0) return false
  const open = v.lastIndexOf('<', pos - 1)
  if (open === -1) return false
  const close = v.lastIndexOf('>', pos - 1)
  if (close > open) return false
  const nl = v.lastIndexOf('\n', pos - 1)
  if (nl > open) return false
  const next = v.indexOf('>', open)
  return next !== -1 && next >= pos
}

const HAS_TAG = /[<>]/

/**
 * בניית דיווח "טעות בספר": הטקסט אחרי ההחלפה (הבחירה ← הסימון), offset = מיקום הסימון,
 * וההקשר — מתוך הטקסט כפי שייראה אחרי ההחלפה.
 * @param {{ bookPath: string, pageNumber: number, column: string, value: string, start: number, end: number,
 *   original: string, proposed: string, note?: string, cropRect?: object|null }} input
 *   cropRect — האזור בצילום (scanCropFor בעורך); לא תקין → לא נשלח
 * @returns {{ ok: true, body: object, newValue: string, caret: number, marker: string } | { ok: false, error: string }}
 */
export function buildErrorSubmission({ bookPath, pageNumber, column, value, start, end, original, proposed, note = '', cropRect = null }) {
  const o = typeof original === 'string' ? original : ''
  const p = typeof proposed === 'string' ? proposed : ''
  if (HAS_TAG.test(o) || HAS_TAG.test(p)) return { ok: false, error: 'אי אפשר לדווח על קטע שכולל תגי עיצוב. סמנו רק את הטקסט עצמו.' }
  const v = typeof value === 'string' ? value : ''
  const s = clampIndex(start, v.length)
  const e = Math.max(s, clampIndex(end, v.length))
  // מה שמוחלף בפועל בטקסט (ולא רק מה שבשדה "הטקסט שבספר", שהמשתמש יכול לערוך): תג עיצוב
  // היה נמחק, ומעבר שורה היה נעלם (שדה input מוחק מעברי שורה ו"הטקסט שבספר" כבר לא תואם)
  const replaced = v.slice(s, e)
  if (HAS_TAG.test(replaced)) return { ok: false, error: 'אי אפשר לדווח על קטע שכולל תגי עיצוב. סמנו רק את הטקסט עצמו.' }
  if (/[\r\n]/.test(replaced)) return { ok: false, error: 'אפשר לדווח רק על טקסט שבשורה אחת. סמנו קטע קצר יותר.' }
  // "הטקסט שבספר" ניתן לעריכה בחלון, אבל הסימון מחליף את הבחירה המקורית: אם הוא שונה ממנה, טקסט העמוד
  // היה נכתב מחדש בשקט והדיווח לא היה תואם למה שהיה בעמוד
  if (o.trim() !== replaced.trim()) return { ok: false, error: 'הטקסט שבספר חייב להיות זהה לקטע המסומן. ערכו רק את התיקון המוצע, או סמנו מחדש.' }
  const marker = buildErrorMarker(o, p)
  const newValue = v.slice(0, s) + marker + v.slice(e)
  const ctx = contextAround(newValue, s, s + marker.length)
  const checked = normalizeReportInput({
    kind: 'book_error',
    bookPath,
    pageNumber,
    column: fieldColumn(column),
    original: o,
    proposed: p,
    offset: s,
    contextBefore: ctx.contextBefore,
    contextAfter: ctx.contextAfter,
    message: note,
    cropRect,
  })
  if (!checked.ok) return checked
  return { ok: true, body: checked.value, newValue, caret: s + marker.length, marker }
}

/**
 * בניית "הודעה למנהלים על העמוד".
 * @returns {{ ok: true, body: object } | { ok: false, error: string }}
 */
export function buildMessageSubmission({ bookPath, pageNumber, message }) {
  const checked = normalizeReportInput({ kind: 'message', bookPath, pageNumber, message })
  if (!checked.ok) return checked
  return { ok: true, body: checked.value }
}

/** כמה תווים נשארו בהודעה (שלילי — חריגה) */
export function messageCharsLeft(message) {
  return MAX_MESSAGE - String(message ?? '').trim().length
}

/**
 * ההבדל בין הטקסט שבספר לתיקון — לתצוגה המקדימה: התחלה וסוף משותפים, והאמצע שהשתנה.
 * @returns {{ prefix: string, removed: string, added: string, suffix: string }}
 */
export function markerDiff(original, proposed) {
  const a = Array.from(String(original ?? ''))
  const b = Array.from(String(proposed ?? ''))
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  let j = 0
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++
  return {
    prefix: a.slice(0, i).join(''),
    removed: a.slice(i, a.length - j).join(''),
    added: b.slice(i, b.length - j).join(''),
    suffix: a.slice(a.length - j).join(''),
  }
}

/** מי רשאי לדווח על טעות (הדיווח משנה את הטקסט): מי שתפס את העמוד, או מנהל ספרים */
export function canReportBookError({ claimState, role }) {
  return claimState === 'mine' || hasBooksAccess(role)
}

/** הדיווח רק על טעות שבספר עצמו; טעות זיהוי מתקנים ישירות בטקסט */
export const BOOK_ERROR_SCOPE_HINT = 'טעות שמופיעה בצילום. טעות זיהוי — מתקנים בטקסט.'

/** שורת ההסבר בראש חלון הדיווח */
export const BOOK_ERROR_SCOPE_TEXT = 'הדיווח הזה מיועד לטעות שנמצאת בספר המודפס עצמו, כפי שהיא מופיעה בצילום. טעות זיהוי (OCR) — מתקנים ישירות בטקסט, בלי דיווח.'

/**
 * פריטי תפריט הלחיצה הימנית (בלי הפעולות עצמן).
 * @param {{ hasSelection: boolean, canReport: boolean, online: boolean }} state
 * @returns {Array<{ id: string, label: string, icon?: string, shortcut?: string[], disabled?: boolean, hint?: string } | { separator: true, id: string }>}
 */
export function editorMenuModel({ hasSelection, canReport, online }) {
  const offlineHint = 'דורש חיבור לרשת'
  return [
    {
      id: 'reportError',
      label: 'דווח על טעות בספר המודפס',
      icon: 'flag',
      disabled: !online || !canReport,
      hint: !online ? offlineHint
        : !canReport ? 'רק מי שתפס את העמוד יכול לדווח על טעות, כי הדיווח משנה את הטקסט'
          : hasSelection ? BOOK_ERROR_SCOPE_HINT : `על המילה שתחת הסמן. ${BOOK_ERROR_SCOPE_HINT}`,
    },
    {
      id: 'pageMessage',
      label: 'הודעה למנהלים על העמוד',
      icon: 'forum',
      disabled: !online,
      hint: !online ? offlineHint : undefined,
    },
    { separator: true, id: 'sep-clipboard' },
    { id: 'cut', label: 'גזור', icon: 'content_cut', shortcut: ['Ctrl', 'X'], disabled: !hasSelection },
    { id: 'copy', label: 'העתק', icon: 'content_copy', shortcut: ['Ctrl', 'C'], disabled: !hasSelection },
    { id: 'paste', label: 'הדבק', shortcut: ['Ctrl', 'V'] },
  ]
}

export const BROWSER_MENU_HINT = 'Shift + לחצן ימני — התפריט הרגיל של הדפדפן'
export const PASTE_FALLBACK_MESSAGE = 'הדפדפן לא מאפשר להדביק מהתפריט. אפשר להדביק עם Ctrl+V.'
export const COPY_FALLBACK_MESSAGE = 'הדפדפן לא מאפשר להעתיק מהתפריט. אפשר להעתיק עם Ctrl+C.'
export const CUT_FALLBACK_MESSAGE = 'הדפדפן לא מאפשר לגזור מהתפריט. אפשר לגזור עם Ctrl+X.'

/** הודעת שגיאה לפי תשובת השרת */
export function reportErrorMessage(status, data) {
  if (data && typeof data.error === 'string' && data.error) return data.error
  if (status === 401) return 'נדרשת התחברות מחדש כדי לשלוח דיווח.'
  if (status === 403) return 'אין לך הרשאה לשלוח דיווח על העמוד הזה.'
  if (status === 429) return 'נשלחו דיווחים רבים בזמן קצר. נסו שוב מאוחר יותר.'
  return 'שליחת הדיווח נכשלה. בדקו את החיבור ונסו שוב.'
}

const STATUS_TEXT = {
  pending: { label: 'ממתין', tone: 'warning' },
  approved: { label: 'אושר', tone: 'success' },
  rejected: { label: 'נדחה', tone: 'error' },
  handled: { label: 'טופל', tone: 'success' },
}

/** תווית וגוון לסטטוס דיווח */
export function reportStatusText(status) {
  return STATUS_TEXT[status] || { label: 'לא ידוע', tone: 'neutral' }
}
