/**
 * סל עריכות של "מידע על ספרים": אימות, החלה על מצב הקובץ וסיכום ל-PR.
 *
 * עריכה מזוהה לפי מפתח טבעי (שם הספר ושם המחבר כפי שהם ב-book_info.csv) ולא לפי id, ונושאת רק
 * את השדות ששונו. כך אפשר להחיל אותה מחדש על כל master עדכני, ו-PR פתוח נבנה מחדש אחרי כל מיזוג.
 */
import { BOOK_INFO_EDITABLE_FIELDS } from '../book-info-constants.js'
import { buildDiff, normalizeBookInfoUpdates } from '../book-info-utils.js'
import { cloneBookInfoState, rowKey } from './csv.js'

export const MAX_OPS_PER_CHANGE_SET = 500

const FIELD_LABELS = {
  bookName: 'שם הספר',
  authorName: 'מחבר',
  generationName: 'דור',
  subGenerationName: 'תת-דור',
  startYear: 'משנה',
  endYear: 'עד שנה',
}

const same = (a, b) => (a ?? null) === (b ?? null) || (a === '' && b == null) || (a == null && b === '')

/**
 * מאמת סל שהגיע מהדפדפן מול מצב הקובץ, ומחזיר אותו מנורמל.
 * כל פריט: {book, author, updates} כשהעדכונים הם השדות שהמשתמש שלח (גם שדות שלא השתנו).
 * @returns {{ops:Array<object>}|{error:string}}
 */
export function validateChangeSet(rawOps, state) {
  if (!Array.isArray(rawOps) || rawOps.length === 0) return { error: 'הסל ריק' }
  if (rawOps.length > MAX_OPS_PER_CHANGE_SET) return { error: `בסל יותר מ-${MAX_OPS_PER_CHANGE_SET} שינויים` }
  const ops = []
  const seen = new Set()
  for (const [i, raw] of rawOps.entries()) {
    const where = `שינוי ${i + 1}`
    const book = String(raw?.book ?? '')
    const author = String(raw?.author ?? '')
    const key = rowKey(book, author)
    const current = state.rows.get(key)
    if (!current) return { error: `${where}: הספר "${book}" אינו ברשימה` }
    if (seen.has(key)) return { error: `${where}: הספר "${book}" מופיע בסל יותר מפעם אחת` }
    seen.add(key)

    // מאמתים את השורה כולה אחרי העדכון, כדי שדור ותת-דור יבדקו זה מול זה גם כשרק אחד מהם נשלח
    const merged = {}
    for (const field of BOOK_INFO_EDITABLE_FIELDS) merged[field] = field in (raw.updates || {}) ? raw.updates[field] : current[field]
    const { updates, errors } = normalizeBookInfoUpdates(merged)
    if (errors.length > 0) return { error: `${where} (${book}): ${errors[0]}` }

    const changes = buildDiff(current, updates)
    if (Object.keys(changes).length === 0) return { error: `${where} (${book}): אין שינוי מול הנתון בקובץ` }
    ops.push({ type: 'update', book, author, changes })
  }
  return { ops }
}

/**
 * מחיל סל על עותק של המצב. עריכה שכבר אינה רלוונטית (הספר נעלם, או שהערכים כבר זהים) היא no-op,
 * כדי שהחלה חוזרת אחרי שינוי ב-master לא תיכשל.
 * @returns {{state:object, results:Array<{op:object, status:'applied'|'noop', reason?:string, before?:object}>}}
 */
export function applyChangeSet(baseState, ops) {
  const state = cloneBookInfoState(baseState)
  const results = []
  for (const op of ops) {
    const key = rowKey(op.book, op.author)
    const row = state.rows.get(key)
    if (!row) {
      results.push({ op, status: 'noop', reason: 'הספר כבר אינו ברשימה' })
      continue
    }
    const effective = {}
    for (const [field, value] of Object.entries(op.changes)) if (!same(row[field], value)) effective[field] = value
    if (Object.keys(effective).length === 0) {
      results.push({ op, status: 'noop', reason: 'כבר קיים' })
      continue
    }
    const next = { ...row, ...Object.fromEntries(Object.entries(effective).map(([f, v]) => [f, v === '' && f !== 'authorName' && f !== 'bookName' ? null : v])) }
    const nextKey = rowKey(next.bookName, next.authorName)
    if (nextKey !== key && state.rows.has(nextKey)) {
      results.push({ op, status: 'noop', reason: 'ספר באותו שם ומחבר כבר קיים' })
      continue
    }
    const before = Object.fromEntries(Object.keys(effective).map((f) => [f, row[f]]))
    state.rows.delete(key)
    state.rows.set(nextKey, next)
    results.push({ op, status: 'applied', before, after: effective })
  }
  return { state, results }
}

// תא בטבלת markdown: ערך כקוד, בלי ש-| או ` ישברו את הטבלה
function cell(value) {
  if (value === null || value === undefined || value === '') return '—'
  const safe = String(value).replace(/\|/g, '\\|')
  return safe.includes('`') ? safe : `\`${safe}\``
}

const bookLabel = (op) => `**${op.book.replace(/\|/g, '\\|')}**${op.author ? ` _(${op.author.replace(/\|/g, '\\|')})_` : ''}`

function rowsFor(r) {
  const changed = r.status === 'applied' ? r.after : r.op.changes
  const fields = BOOK_INFO_EDITABLE_FIELDS.filter((field) => field in changed)
  return fields.map((field, i) => {
    const before = r.status === 'applied' ? cell(r.before[field]) : ''
    const after = cell(r.status === 'applied' ? r.after[field] : r.op.changes[field])
    const note = r.reason && i === 0 ? ` _(${r.reason})_` : ''
    return `| ${i === 0 ? bookLabel(r.op) : ''} | ${FIELD_LABELS[field]} | ${before} | ${after}${note} |`
  })
}

/**
 * גוף PR בעברית: טבלת לפני/אחרי לפי ספר ושדה, ועריכות בלי השפעה מקופלות בסוף.
 * maxLength מקצר בשורות שלמות, כדי שהטבלה לא תישבר באמצע.
 */
export function summarizeChangeSet(results, { maxLength = Infinity } = {}) {
  const applied = results.filter((r) => r.status === 'applied')
  const noop = results.filter((r) => r.status !== 'applied')
  const counts = { update: applied.length, noop: noop.length }
  const head = `**${counts.update} ספרים עודכנו**` + (counts.noop ? `; ועוד ${counts.noop} ללא השפעה.` : '.')
  const TABLE = ['| ספר | שדה | לפני | אחרי |', '|---|---|---|---|']
  const NOTE = '\n\n… הרשימה קוצרה. הפירוט המלא נמצא ב-diff ובתגובת ההבדלים.'

  const lines = [head, '']
  let length = head.length
  const push = (rows) => {
    for (const line of rows) {
      if (length + line.length + 1 > maxLength - NOTE.length) return false
      lines.push(line)
      length += line.length + 1
    }
    return true
  }
  let complete = applied.length === 0 || push([...TABLE, ...applied.flatMap(rowsFor)])
  if (complete && noop.length) {
    complete = push(['', `<details><summary>${noop.length} שינויים שכבר היו במצב המבוקש</summary>`, '', ...TABLE, ...noop.flatMap(rowsFor), '', '</details>'])
    if (!complete) lines.push('', '</details>')
  }
  return { text: lines.join('\n') + (complete ? '' : NOTE), counts, books: counts.update }
}
