// "פרטי ספרים" — הלשונית, הסינון והחיפוש מהכתובת ואליה, ובחירת השדות בהצעות הישנות. לוגיקה טהורה
// (נבדק ב-bookInfoQuery.test.mjs).
//
// בקשות המיזוג מגיעות מ-GET /api/admin/book-info/change-sets (בלי שינוי): active=true — הפתוחות, active=false —
// כולן; עד 200 בכל פעם, מהחדשה לישנה, עם cursor לעמוד הבא. סינון לפי מצב וחיפוש — בצד הלקוח, על מה שנטען.
// ההצעות הישנות — GET /api/admin/book-info/pending (כולן בבת אחת).

import { ATTENTION_STATUSES, STATUS, STATUS_ORDER, STUCK_AFTER_MS, isEmptyValue, statusInfo } from './bookInfoTerms.js'

export const BOOK_INFO_VIEWS = ['open', 'all', 'legacy']
/** ערך מיוחד בבורר המצב: כל מה שדורש טיפול (דורש בדיקה · נערך ב-GitHub · תקוע בפתיחה) */
export const ATTENTION = 'attention'
const DEFAULT_VIEW = 'open'
const PARAM_ORDER = ['view', 'status', 'q']

/** @typedef {{ view: string, status: string, q: string }} BookInfoQuery */

function reader(params) {
  return (name) => {
    if (!params) return ''
    const value = typeof params.get === 'function' ? params.get(name) : params[name]
    return String((Array.isArray(value) ? value[0] : value) ?? '').trim()
  }
}

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params
 * @returns {BookInfoQuery}
 */
export function parseBookInfoQuery(params) {
  const get = reader(params)
  const view = get('view')
  const status = get('status')
  return {
    view: BOOK_INFO_VIEWS.includes(view) ? view : DEFAULT_VIEW,
    status: Object.hasOwn(STATUS, status) || status === ATTENTION ? status : '',
    q: get('q').slice(0, 200),
  }
}

/** הכתובת של שאילתה — בלי ערכי ברירת מחדל ובסדר קבוע; "" כשאין כלום. בהצעות הישנות אין סינון. */
export function serializeBookInfoQuery(query) {
  const params = new URLSearchParams()
  for (const name of PARAM_ORDER) {
    const value = query?.[name]
    if (value === undefined || value === null || value === '') continue
    if (name === 'view' && value === DEFAULT_VIEW) continue
    if (query.view === 'legacy' && name !== 'view') continue
    params.set(name, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** הכתובת לבקשת הרשימה — בדיוק כמו המסך הקודם */
export function changeSetsUrl(view, cursor) {
  return `/api/admin/book-info/change-sets?active=${view !== 'all'}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
}

/** חיפוש בשם הספר, במחבר ובמי שהציע */
export function matchesSearch(row, q) {
  const term = String(q || '').trim().toLowerCase()
  if (!term) return true
  return [row.book, row.author, row.submittedBy].some((v) => String(v || '').toLowerCase().includes(term))
}

/** "בפתיחה" כבר יותר מ-STUCK_AFTER_MS (לפי מועד היצירה — השרת לא מחזיר מועד אחר) */
export function isStuck(row, now = Date.now()) {
  if (row?.status !== 'publishing') return false
  const at = Date.parse(row.createdAt)
  return Number.isFinite(at) && now - at > STUCK_AFTER_MS
}

/** המצב של בקשה; "בפתיחה" שנתקע — "stuck"; מצב שהמסך לא מכיר — "נכשל" (כמו בתג) */
export function statusId(row, now = Date.now()) {
  if (isStuck(row, now)) return 'stuck'
  return Object.hasOwn(STATUS, row?.status) && row.status !== 'stuck' ? row.status : 'failed'
}

const matchesStatus = (row, status, now) => !status || (status === ATTENTION ? ATTENTION_STATUSES.includes(statusId(row, now)) : statusId(row, now) === status)

/** הבקשות שמוצגות: מצב (או "דורש טיפול") וחיפוש */
export function filterChangeSets(rows, query, now = Date.now()) {
  return (rows || []).filter((row) => matchesStatus(row, query.status, now) && matchesSearch(row, query.q))
}

/**
 * "פתוחות": הבקשות הפעילות (active=true), ואיתן הבקשות שנכשלו מתוך האחרונות (active=false) — כדי שמנהל יראה
 * שמשהו לא נפתח. בלי כפילות, מהחדשה לישנה.
 */
export function withFailed(activeRows, recentRows, now = Date.now()) {
  const failed = (recentRows || []).filter((row) => statusId(row, now) === 'failed')
  return mergeRows(activeRows, failed)
}

/** "טען עוד": השורות הקיימות ואחריהן החדשות, בלי כפילות (לפי id), מהחדשה לישנה */
export function mergeRows(rows, more) {
  const seen = new Set()
  const out = []
  for (const row of [...(rows || []), ...(more || [])]) {
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
}

/**
 * האפשרויות לבורר "מצב" — רק מצבים שיש בנטען, עם מספר; לפי הסדר הקבוע. בראש — "צריך בדיקה" (כל מה שדורש
 * מבט), כשיש יותר ממצב אחד כזה.
 */
export function statusOptions(rows, now = Date.now()) {
  const counts = new Map()
  for (const row of rows || []) {
    const id = statusId(row, now)
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  const options = STATUS_ORDER.filter((id) => counts.has(id)).map((id) => ({ value: id, label: statusInfo(id).label, count: counts.get(id) }))
  const attention = ATTENTION_STATUSES.filter((id) => counts.has(id))
  if (attention.length > 1) options.unshift({ value: ATTENTION, label: 'כל מה שדורש טיפול', count: attention.reduce((n, id) => n + counts.get(id), 0) })
  return options
}

/** כמה בקשות דורשות טיפול (דורש בדיקה · נערך ב-GitHub · תקוע בפתיחה) — רק מה שמנהל יכול לטפל בו */
export function attentionCount(rows, now = Date.now()) {
  return (rows || []).filter((row) => ATTENTION_STATUSES.includes(statusId(row, now))).length
}

// ----- ההצעות הישנות -----

// הבחירה: { [changeId]: string[] } — השדות המסומנים בכל הצעה. בהתחלה אין סימון (כמו במסך הקודם): מנהל בוחר מה
// לשלוח או למחוק. "בחר" של הצעה מסמן את כל השדות שלה; הצעה "נבחרה" כשיש בה לפחות שדה מסומן.

/** השדות המסומנים בהצעה, לפי הסדר שבה (שדה שכבר לא בהצעה — בחוץ) */
export function checkedFields(selection, row) {
  const set = new Set(selection?.[row.id] || [])
  return (row.changedFields || []).filter((f) => set.has(f))
}

/** סימון / ביטול של שדה בהצעה; הצעה בלי שדה מסומן — יוצאת מהבחירה */
export function toggleField(selection, row, field, checked) {
  const set = new Set(checkedFields(selection, row))
  if (checked) set.add(field)
  else set.delete(field)
  return withFields(selection, row.id, (row.changedFields || []).filter((f) => set.has(f)))
}

/** סימון / ביטול של כל השדות בכמה הצעות ("בחר" בכרטיס, "בחר את כל ההצעות") */
export function toggleRows(selection, rows, checked) {
  let next = selection
  for (const row of rows || []) next = withFields(next, row.id, checked ? [...(row.changedFields || [])] : [])
  return next
}

function withFields(selection, id, fields) {
  const next = { ...selection }
  if (fields.length > 0) next[id] = fields
  else delete next[id]
  return next
}

/** מה נשלח לשרת: { changeId, fields } לכל הצעה עם שדה מסומן (כמו במסך הקודם). אף פעם fields ריק — בשרת זה "הכול". */
export function selectionsFor(rows, selection) {
  return (rows || [])
    .map((row) => ({ changeId: row.id, fields: checkedFields(selection, row) }))
    .filter((item) => item.fields.length > 0)
}

const sameValue = (a, b) => (isEmptyValue(a) && isEmptyValue(b)) || String(a ?? '').trim() === String(b ?? '').trim()

/** השדה בהצעה שווה למה שכבר בקובץ — אין בו שינוי */
export const isUnchangedField = (row, field) => sameValue(row?.approved?.[field], row?.changes?.[field])

/** בהצעה אין אף שינוי מול הקובץ — אפשר רק למחוק אותה */
export const hasNoChange = (row) => (row?.changedFields || []).length > 0 && row.changedFields.every((f) => isUnchangedField(row, f))

/**
 * ההצעה אחרי שחלק מהשדות שלה טופלו (נפתחו כבקשה או נמחקו): בלי השדות האלה; null — כשלא נשאר בה שדה.
 * כמו בשרת — שם ההצעה נמחקת כשלא נשארו בה שדות.
 */
export function dropFields(row, fields) {
  const changedFields = (row.changedFields || []).filter((f) => !fields.includes(f))
  return changedFields.length > 0 ? { ...row, changedFields } : null
}
