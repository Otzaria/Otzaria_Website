// "תיוג מבנה" (/library/admin/ocr-layout) — לשונית וסינון מהכתובת ואליה, הבקשה לשרת, תקציר התשובות של עמוד
// וסיכום ייבוא. לוגיקה טהורה (נבדק ב-trainingScreens.test.mjs). השרת (GET /api/admin/ocr-layout, בלי שינוי) מחזיר
// 30 עמודים בכל פעם (skip), עם המונים ועם רשימות הסינון (facets).
// שמות סוגי המשימות (TASK_LABELS מ-lib/ocr/layoutValidation) מגיעים כפרמטר — הקובץ ההוא מייבא בלי סיומת, ולא נטען
// ב-node:test.
import { formatNumber } from '../adminTerms.js'
import { oneOf, reader, serializeParams } from './trainingTerms.js'

// אותו סדר כמו בתמלול שורות: ממתין לאישור → פנוי → מאושר
export const LAYOUT_TABS = ['submitted', 'available', 'approved']
const DEFAULT_TAB = 'submitted'
export const LAYOUT_KINDS = ['pagenum', 'header', 'streams', 'zones-full']
/**
 * שמות סוגי המשימות במסך — מונח אחד לכל דבר, כמו בתיאור המסך ("חלוקה לטורים", לא "זרמים" / "רצועות"). רק התוויות
 * במסך; הערכים בשרת (ו-TASK_LABELS שהשרת משתמש בו בהודעות שגיאה) לא משתנים.
 */
export const LAYOUT_KIND_LABELS = { pagenum: 'מספר עמוד', header: 'כותרת רצה', streams: 'חלוקה לטורים', 'zones-full': 'עמוד מלא' }
export const LAYOUT_KIND_HINTS = { 'zones-full': 'כל הסימונים בעמוד אחד — מספר עמוד, כותרת וטורים' }

/** @typedef {{ tab: string, batch: string, edition: string, kind: string }} LayoutQuery */

/** @returns {LayoutQuery} */
export function parseLayoutQuery(params) {
  const get = reader(params)
  return {
    tab: oneOf(get('tab'), LAYOUT_TABS, DEFAULT_TAB),
    batch: get('batch'),
    edition: get('edition'),
    kind: oneOf(get('kind'), LAYOUT_KINDS, ''),
  }
}

/** @param {LayoutQuery} query */
export function serializeLayoutQuery(query) {
  return serializeParams([
    ['tab', query.tab, DEFAULT_TAB],
    ['batch', query.batch, ''],
    ['edition', query.edition, ''],
    ['kind', query.kind, ''],
  ])
}

/** הבקשה לשרת — אותם פרמטרים ובאותו סדר כמו במסך הקודם */
export function layoutUrl(query, skip = 0) {
  const params = new URLSearchParams({ status: query.tab, skip: String(skip) })
  if (query.batch) params.set('batch', query.batch)
  if (query.edition) params.set('edition', query.edition)
  if (query.kind) params.set('kind', query.kind)
  return `/api/admin/ocr-layout?${params}`
}

/** כמה מסננים פעילים (לכפתור "נקה סינון") */
export function activeFilters(query) {
  return ['batch', 'edition', 'kind'].filter((k) => query[k]).length
}

const columnsText = (n) => (n === 1 ? 'טור אחד' : `${formatNumber(n)} טורים`)

/**
 * תקציר תשובה של משימה, לשורה ברשימה — כמו במסך הקודם; "ההצעה של המכונה אושרה" כשהמתנדב אישר את ההצעה.
 * @param {{ kind: string, answer?: any, confirmed?: boolean }} task
 * @param {Record<string, string>} labels שמות סוגי המשימות
 */
export function taskSummary(task, labels) {
  const label = labels?.[task.kind] || task.kind
  const conf = task.confirmed ? ' · ההצעה של המכונה אושרה' : ''
  const a = task.answer
  if (!a) return `${label}: עוד לא סומן`
  if (task.kind === 'pagenum') return `${label}: ${a.value === null ? 'אין מספר' : a.value}${conf}`
  if (task.kind === 'header') return `${label}: ${a.box === null ? 'אין כותרת' : 'סומנה'}${conf}`
  if (task.kind === 'streams') return `${label}: ${columnsText((a.bands || []).length)}${conf}`
  if (task.kind === 'zones-full') {
    const parts = []
    if (a.pagenum) parts.push(a.pagenum.value === null ? 'אין מספר' : String(a.pagenum.value))
    if (a.header) parts.push(a.header.box === null ? 'אין כותרת' : 'כותרת')
    if (a.streams) parts.push(columnsText((a.streams.bands || []).length))
    return `${label}: ${parts.join(' · ')}${conf}`
  }
  return label
}

/**
 * סיכום ייבוא (summary מהשרת) — שורות טקסט פשוטות.
 * @param {{ pages: number, created: number, updated: number, skippedAnswered?: number, byKind?: Record<string, number>, errors?: string[] }} s
 * @param {Record<string, string>} labels שמות סוגי המשימות
 * @returns {{ lines: string[], errors: string[] }}
 */
export function importSummaryText(s, labels) {
  if (!s) return { lines: [], errors: [] }
  const lines = [`נקלטו ${formatNumber(s.pages)} עמודים: ${formatNumber(s.created)} חדשים, ${formatNumber(s.updated)} עודכנו.`]
  if (s.skippedAnswered > 0) lines.push(`${formatNumber(s.skippedAnswered)} דולגו, כי כבר סומנו.`)
  const kinds = Object.entries(s.byKind || {}).filter(([, n]) => n > 0).map(([k, n]) => `${labels?.[k] || k} — ${formatNumber(n)}`)
  if (kinds.length) lines.push(`לפי סוג: ${kinds.join(' · ')}`)
  return { lines, errors: (s.errors || []).slice(0, 5) }
}
