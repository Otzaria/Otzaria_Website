// "תמלול שורות" (/library/admin/ocr-lines) — לשונית ומקור מהכתובת ואליה, הבקשה לשרת, עדכון המונים אחרי פעולה
// ומקשי המקלדת. לוגיקה טהורה (נבדק ב-trainingScreens.test.mjs). השרת (GET /api/admin/ocr-lines, בלי שינוי) מחזיר
// 50 שורות בכל פעם (skip), עם המונים של כל המצבים במקור הנבחר.
import { oneOf, reader, serializeParams } from './trainingTerms.js'

/** הלשוניות — לפי סדר העבודה: מה שמחכה להחלטה קודם */
export const LINE_TABS = ['submitted', 'flagged', 'available', 'approved']
const DEFAULT_TAB = 'submitted'
/** המקור של השורות — אותם ערכים שהשרת מקבל (pool) */
export const LINE_POOLS = ['all', 'proofread', 'legacy']
export const POOL_LABELS = { all: 'כל השורות', proofread: 'מההגהה', legacy: 'מעמודים לאימון' }
export const POOL_HINTS = {
  proofread: 'שורות שהמודלים לא הסכימו עליהן, שנשלחו לתמלול',
  legacy: 'השורות שסומנו בעמודים לאימון',
}
/** סיבת הדיווח של מתנדב על שורה */
export const FLAG_LABELS = { unreadable: 'לא קריא', bad_crop: 'החיתוך שגוי' }

/** @typedef {{ tab: string, pool: string }} LinesQuery */

/** @returns {LinesQuery} */
export function parseLinesQuery(params) {
  const get = reader(params)
  return { tab: oneOf(get('tab'), LINE_TABS, DEFAULT_TAB), pool: oneOf(get('pool'), LINE_POOLS, 'all') }
}

/** @param {LinesQuery} query */
export function serializeLinesQuery(query) {
  return serializeParams([
    ['tab', query.tab, DEFAULT_TAB],
    ['pool', query.pool, 'all'],
  ])
}

/** הבקשה לשרת — בדיוק כמו במסך הקודם (status, skip, pool) */
export function linesUrl(query, skip = 0) {
  return `/api/admin/ocr-lines?status=${query.tab}&skip=${skip}&pool=${query.pool}`
}

/** "טען עוד": השורות הקודמות ואחריהן החדשות, בלי כפולות (העימוד לפי skip יכול להחזיר שורה שכבר מוצגת) */
export function appendLines(previous, loaded) {
  const seen = new Set((previous || []).map((l) => l.id))
  return [...(previous || []), ...(loaded || []).filter((l) => !seen.has(l.id))]
}

/**
 * המונים אחרי שפעולה הוציאה שורה מהלשונית: from יורד באחד, to (אם יש) עולה באחד.
 * @param {Record<string, number>} counts @param {string} from @param {string | null} to
 */
export function moveCount(counts, from, to) {
  const next = { ...counts, [from]: Math.max(0, (counts?.[from] || 0) - 1) }
  if (to) next[to] = (next[to] || 0) + 1
  return next
}

/** הלשונית שהשורה נמצאת בה: שורה שדווחה (flagged) — "דורש בדיקה", גם כשהשרת מחזיר אותה כפנויה */
export function lineTab(line) {
  return line?.flagged ? 'flagged' : oneOf(line?.status, LINE_TABS, 'available')
}

/** אפשר לאשר: הוגשה, ואין הצעה פתוחה לשנות את סוג הכתב (קודם מחליטים עליה) */
export function canApprove(line) {
  return line?.status === 'submitted' && !line?.suggestedScriptType
}
/** למה אי אפשר לאשר את השורה (להודעה כשלוחצים A / "אשר"); null — אפשר */
export function approveBlockReason(line) {
  if (line?.status !== 'submitted') return 'אפשר לאשר רק שורה שממתינה לאישור.'
  if (line.suggestedScriptType) return 'יש הצעה לשנות את סוג הכתב — קבל או דחה אותה לפני האישור.'
  return null
}
/** אפשר לשלוח להקלדה מחדש: יש טקסט שהוקלד (הוגשה או אושרה) */
export function canReturn(line) {
  return Boolean(line) && line.status !== 'available'
}

/**
 * מקשים ברשימה: ↑ ↓ (או J / K) בין השורות, A — אשר, R — שלח להקלדה מחדש (פותח את חלון האישור). בלי מקשי שינוי (Ctrl+A נשאר "בחר הכול").
 * @returns {'next' | 'prev' | 'approve' | 'return' | null}
 */
export function lineKeyAction(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.key === 'ArrowDown' || event.code === 'KeyJ') return 'next'
  if (event.key === 'ArrowUp' || event.code === 'KeyK') return 'prev'
  if (event.code === 'KeyA') return 'approve'
  if (event.code === 'KeyR') return 'return'
  return null
}
export const LINES_KEYBOARD_HINT = 'במקלדת: J / K (או ↑ ↓ ברשימה) בין השורות, A — אשר, R — שלח להקלדה מחדש.'
