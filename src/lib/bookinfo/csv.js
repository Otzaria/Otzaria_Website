/**
 * קריאה וכתיבה של ForDB/book_info.csv בריפו Otzaria/otzaria-library.
 *
 * הפורמט הקנוני: שורת כותרת קבועה, כל שדה במירכאות (כמו csv.QUOTE_ALL של Python שבו הריפו
 * עורך את קובצי ה-CSV שלו), סופי שורה LF, UTF-8 בלי BOM, ושורה אחת לכל ספר ממוינת לפי שם הספר
 * ואחריו שם המחבר. הייצוא כאן תמיד קנוני, כדי ש-PR מהאתר ייראה כשינוי של השורות שנגענו בהן בלבד.
 * הקריאה סלחנית יותר (סדר שורות ומירכאות חופשיים), והקובץ ייכתב מחדש בצורה הקנונית בקומיט הראשון.
 */

import { BOOK_INFO_GENERATION_OPTIONS, BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION } from '../book-info-constants.js'

export const BOOK_INFO_COLUMNS = ['bookName', 'authorName', 'generationName', 'subGenerationName', 'startYear', 'endYear']

export const MIN_YEAR = -2147483648
export const MAX_YEAR = 2147483647

export function assertStorageRow(row) {
  if (row.generationName && !BOOK_INFO_GENERATION_OPTIONS.includes(row.generationName)) throw new Error('Unsupported generation')
  if (row.subGenerationName && !BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION[row.generationName]?.includes(row.subGenerationName)) throw new Error('Subgeneration does not match generation')
  if (row.startYear != null && row.endYear != null && row.startYear > row.endYear) throw new Error('startYear exceeds endYear')
  for (const field of ['startYear', 'endYear']) {
    if (row[field] != null && (!Number.isInteger(row[field]) || row[field] < MIN_YEAR || row[field] > MAX_YEAR)) throw new Error(`${field} must be a signed 32-bit integer`)
  }
  for (const field of ['bookName', 'authorName', 'generationName', 'subGenerationName']) {
    if (row[field] != null && (typeof row[field] !== 'string' || !row[field].isWellFormed() || /[\r\u0000\ufeff]/.test(row[field]))) throw new Error(`${field} contains unsupported text`)
  }
}

const TEXT_FIELDS = ['bookName', 'authorName', 'generationName', 'subGenerationName']

/** מפתח הזהות של שורה: אותו זוג (ספר, מחבר) שהאינדקס הייחודי ב-Mongo משתמש בו. */
export const rowKey = (bookName, authorName) => `${bookName}\u0000${authorName || ''}`

// Python producers sort Unicode code points; native JS ordering differs for astral characters.
const compare = (a, b) => {
  if (!/[\uD800-\uDBFF]/.test(a + b)) return a < b ? -1 : a > b ? 1 : 0
  const left = Array.from(a, (ch) => ch.codePointAt(0))
  const right = Array.from(b, (ch) => ch.codePointAt(0))
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1
  return left.length - right.length
}

function parseRecords(text) {
  const records = []
  let record = []
  let field = ''
  let quoted = false
  let closedQuote = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        closedQuote = true
      } else {
        field += ch
      }
    } else if (closedQuote && ch !== ',' && ch !== '\n') {
      throw new Error('book_info.csv has text after a closing quote')
    } else if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === '"') {
      throw new Error('book_info.csv has a quote in an unquoted field')
    } else if (ch === ',') {
      record.push(field)
      field = ''
      closedQuote = false
    } else if (ch === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
      closedQuote = false
    } else {
      field += ch
    }
    i++
  }
  if (quoted) throw new Error('book_info.csv has an unterminated quoted field')
  if (field !== '' || record.length > 0 || closedQuote) {
    record.push(field)
    records.push(record)
  }
  return records
}

function toRow(cells, lineNo) {
  const row = {}
  for (const [i, column] of BOOK_INFO_COLUMNS.entries()) {
    const value = cells[i]
    if (TEXT_FIELDS.includes(column)) {
      row[column] = value === '' ? (column === 'bookName' || column === 'authorName' ? '' : null) : value
    } else {
      if (value === '') {
        row[column] = null
      } else if (/^-?\d+$/.test(value)) {
        row[column] = Number(value)
      } else {
        throw new Error(`book_info.csv line ${lineNo}: ${column} is not an integer`)
      }
    }
  }
  assertStorageRow(row)
  if (!row.bookName) throw new Error(`book_info.csv line ${lineNo}: bookName is empty`)
  return row
}

/**
 * @param {string} text תוכן הקובץ
 * @returns {{rows: Map<string, {bookName:string, authorName:string, generationName:string|null, subGenerationName:string|null, startYear:number|null, endYear:number|null}>}}
 */
export function parseBookInfoCsv(text) {
  if (text.includes('\r')) throw new Error('book_info.csv must use LF line endings')
  if (text.charCodeAt(0) === 0xfeff) throw new Error('book_info.csv must not start with a BOM')
  const [header, ...records] = parseRecords(text)
  if (!header || header.join(',') !== BOOK_INFO_COLUMNS.join(',')) {
    throw new Error(`book_info.csv header must be ${BOOK_INFO_COLUMNS.join(',')}`)
  }
  const rows = new Map()
  for (const [i, cells] of records.entries()) {
    const lineNo = i + 2
    if (cells.length !== BOOK_INFO_COLUMNS.length) throw new Error(`book_info.csv line ${lineNo}: expected ${BOOK_INFO_COLUMNS.length} columns`)
    const row = toRow(cells, lineNo)
    assertStorageRow(row)
    const key = rowKey(row.bookName, row.authorName)
    if (rows.has(key)) throw new Error(`book_info.csv line ${lineNo}: duplicate book "${row.bookName}" by "${row.authorName}"`)
    rows.set(key, row)
  }
  return { rows }
}

/**
 * מצב מתוך רשומות (למשל BookInfo מ-Mongo), באותה נורמליזציה של הקריאה מהקובץ: מחרוזת ריקה בדור
 * היא null, שם מחבר חסר הוא ''. ייצוא שלו הוא הקובץ הראשוני להעלאה ל-ForDB.
 */
export function bookInfoStateFromRows(records) {
  const rows = new Map()
  for (const record of records) {
    const row = {}
    for (const column of BOOK_INFO_COLUMNS) {
      const value = record[column]
      if (column === 'bookName' || column === 'authorName') row[column] = value ?? ''
      else row[column] = value === '' || value === undefined ? null : value
    }
    if (!row.bookName) throw new Error('book info record without bookName')
    for (const column of ['startYear', 'endYear']) {
      if (row[column] !== null && !Number.isInteger(row[column])) throw new Error(`book info "${row.bookName}": ${column} is not an integer`)
    }
    assertStorageRow(row)
    const key = rowKey(row.bookName, row.authorName)
    if (rows.has(key)) throw new Error(`duplicate book "${row.bookName}" by "${row.authorName}"`)
    rows.set(key, row)
  }
  return { rows }
}

const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

/** @param {ReturnType<typeof parseBookInfoCsv>} state */
export function exportBookInfoCsv(state) {
  const sorted = [...state.rows.values()].sort((a, b) => compare(a.bookName, b.bookName) || compare(a.authorName, b.authorName))
  const lines = [BOOK_INFO_COLUMNS.join(',')]
  for (const row of sorted) {
    assertStorageRow(row)
    lines.push(BOOK_INFO_COLUMNS.map((column) => quote(row[column])).join(','))
  }
  return lines.join('\n') + '\n'
}

/** עותק עמוק שאפשר לשנות בלי לגעת במצב השמור במטמון. */
export function cloneBookInfoState(state) {
  return { rows: new Map([...state.rows].map(([key, row]) => [key, { ...row }])) }
}

/** השורות לתצוגה, ממוינות כמו בקובץ. */
export function listBookInfo(state) {
  return [...state.rows.values()].sort((a, b) => compare(a.bookName, b.bookName) || compare(a.authorName, b.authorName))
}
