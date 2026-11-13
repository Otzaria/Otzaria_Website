// טווח עמודים ("מעמוד / עד עמוד") — לוגיקה טהורה, בטוחה לדפדפן ולשרת (בלי node:*).
// משמש בהוספת ספר (העלאת חלק מקובץ PDF) ובשליחת ספר ל-OCR. טווח הוא { from, to } (כולל את שניהם,
// מספור מ-1); null = כל העמודים. טסטים: pageRange.test.mjs.
//
// הערה: ל-pageProof/adminGrid.js יש parsePageRange משלו, עם סמנטיקה אחרת בכוונה ("עד" ריק = עמוד
// אחד). כאן "עד" ריק = עד סוף הספר, ו"מ" ריק = מתחילתו — כך שני שדות ריקים הם "הכל".

export const MAX_PAGE_NUMBER = 999999

const DIGITS = /^\d+$/

function readField(raw) {
  const text = String(raw ?? '').trim()
  if (text === '') return { empty: true }
  if (!DIGITS.test(text)) return { invalid: true }
  const n = Number(text)
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_PAGE_NUMBER) return { invalid: true }
  return { value: n }
}

/**
 * קלט טופס (מחרוזות) → טווח. "מ" ריק = 1, "עד" ריק = total. טווח שמכסה את הכל (1..total) → range: null.
 * @param {{ from?: string|number, to?: string|number }} input
 * @param {{ total?: number }} [opts] total — מספר העמודים (או מספר העמוד האחרון); בלעדיו "עד" חובה
 * @returns {{ ok: true, range: { from: number, to: number } | null } | { ok: false, error: string, field: 'from'|'to' }}
 */
export function parsePageRangeInput(input, { total } = {}) {
  const hasTotal = Number.isSafeInteger(total) && total >= 1
  const from = readField(input?.from)
  const to = readField(input?.to)
  if (from.invalid) return { ok: false, field: 'from', error: 'כתבו מספר עמוד שלם (למשל 1).' }
  if (to.invalid) return { ok: false, field: 'to', error: 'כתבו מספר עמוד שלם (למשל 20).' }
  if (to.empty && !hasTotal) {
    if (from.empty) return { ok: true, range: null }
    return { ok: false, field: 'to', error: 'כתבו עד איזה עמוד.' }
  }
  const start = from.empty ? 1 : from.value
  const end = to.empty ? total : to.value
  if (hasTotal && start > total) return { ok: false, field: 'from', error: `יש רק ${total} עמודים.` }
  if (hasTotal && end > total) return { ok: false, field: 'to', error: `יש רק ${total} עמודים.` }
  if (start > end) return { ok: false, field: 'to', error: 'עמוד הסוף לפני עמוד ההתחלה.' }
  if (hasTotal && start === 1 && end === total) return { ok: true, range: null }
  return { ok: true, range: { from: start, to: end } }
}

/**
 * טווח שהגיע כ-JSON (בשרת, או מעבודה שמורה) → טווח תקין או null. ערך חסר/null = כל העמודים.
 * מקבל רק מספרים שלמים (לא מחרוזות) — הלקוח שולח מספרים.
 * @returns {{ ok: true, range: { from: number, to: number } | null } | { ok: false, error: string }}
 */
export function normalizePageRange(value) {
  if (value === undefined || value === null) return { ok: true, range: null }
  const bad = { ok: false, error: 'טווח העמודים לא תקין.' }
  if (typeof value !== 'object' || Array.isArray(value)) return bad
  const { from, to } = value
  const valid = (n) => Number.isSafeInteger(n) && n >= 1 && n <= MAX_PAGE_NUMBER
  if (!valid(from) || !valid(to) || from > to) return bad
  return { ok: true, range: { from, to } }
}

/** האם עמוד (מספור מ-1) בתוך הטווח; טווח null = הכל */
export function pageInRange(pageNumber, range) {
  if (!range) return true
  return pageNumber >= range.from && pageNumber <= range.to
}

/** כמה עמודים בטווח, מתוך total (טווח null = total) */
export function rangePageCount(range, total) {
  const all = Number.isSafeInteger(total) && total > 0 ? total : 0
  if (!range) return all
  const end = all ? Math.min(range.to, all) : range.to
  return Math.max(0, end - range.from + 1)
}

/** תיאור קצר: "כל העמודים" / "עמוד 5" / "עמודים 5–20" */
export function pageRangeText(range) {
  if (!range) return 'כל העמודים'
  return range.from === range.to ? `עמוד ${range.from}` : `עמודים ${range.from}–${range.to}`
}

/** הטווח כשדות טופס (מחרוזות) — לשחזור טופס מטווח שמור */
export function pageRangeFields(range) {
  return range ? { from: String(range.from), to: String(range.to) } : { from: '', to: '' }
}
