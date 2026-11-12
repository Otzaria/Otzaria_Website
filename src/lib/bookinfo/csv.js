/**
 * קריאה וכתיבה של ForDB/book_info.csv בריפו Otzaria/otzaria-library.
 *
 * הפורמט הקנוני: שורת כותרת של 6 עמודות הבסיס או של 11 (בסיס והרחבה), כל שדה במירכאות (כמו csv.QUOTE_ALL של Python שבו הריפו
 * עורך את קובצי ה-CSV שלו), סופי שורה LF, UTF-8 בלי BOM, ושורה אחת לכל ספר ממוינת לפי שם הספר
 * ואחריו שם המחבר. הייצוא כאן תמיד קנוני, כדי ש-PR מהאתר ייראה כשינוי של השורות שנגענו בהן בלבד.
 * הקריאה סלחנית יותר (סדר שורות ומירכאות חופשיים), והקובץ ייכתב מחדש בצורה הקנונית בקומיט הראשון.
 */

import { BOOK_INFO_GENERATION_OPTIONS, BOOK_INFO_LIMITS, BOOK_INFO_SUB_GENERATION_OPTIONS_BY_GENERATION } from '../book-info-constants.js'
import { splitTopics } from '../book-info-utils.js'

/** עמודות הבסיס. קובץ חוקי מכיל אותן בלבד, או אותן ואחריהן עמודות ההרחבה. */
export const BOOK_INFO_COLUMNS = ['bookName', 'authorName', 'generationName', 'subGenerationName', 'startYear', 'endYear']
export const BOOK_INFO_EXTENSION_COLUMNS = ['topics', 'pubDate', 'pubPlace', 'description', 'proofread']
export const BOOK_INFO_ALL_COLUMNS = [...BOOK_INFO_COLUMNS, ...BOOK_INFO_EXTENSION_COLUMNS]

const length = (value) => [...value].length
const hasExtensionValue = (row) => BOOK_INFO_EXTENSION_COLUMNS.some((column) => row[column] != null && row[column] !== '')

function assertExtension(row) {
  for (const field of BOOK_INFO_EXTENSION_COLUMNS) {
    const value = row[field]
    if (value == null) continue
    if (typeof value !== 'string' || !value.isWellFormed() || /[\r\u0000﻿]/.test(value)) throw new Error(`${field} contains unsupported text`)
    if (field !== 'description' && value.includes('\n')) throw new Error(`${field} must be a single line`)
  }
  if (row.proofread != null && row.proofread !== '' && row.proofread !== '1') throw new Error('proofread must be empty or 1')
  for (const field of ['pubDate', 'pubPlace', 'description']) {
    if (row[field] != null && length(row[field]) > BOOK_INFO_LIMITS[field]) throw new Error(`${field} exceeds ${BOOK_INFO_LIMITS[field]} characters`)
  }
  if (row.topics != null) {
    const topics = splitTopics(row.topics)
    if (topics.length > BOOK_INFO_LIMITS.topicCount) throw new Error(`topics has more than ${BOOK_INFO_LIMITS.topicCount} values`)
    if (topics.some((topic) => length(topic) > BOOK_INFO_LIMITS.topicLength)) throw new Error(`a topic exceeds ${BOOK_INFO_LIMITS.topicLength} characters`)
  }
}

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
  assertExtension(row)
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
  for (const [i, column] of BOOK_INFO_ALL_COLUMNS.entries()) {
    const value = cells[i] ?? ''
    if (BOOK_INFO_EXTENSION_COLUMNS.includes(column)) {
      row[column] = value === '' ? null : value
    } else if (TEXT_FIELDS.includes(column)) {
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
  try { assertStorageRow(row) } catch (err) { throw new Error(`book_info.csv line ${lineNo}: ${err.message}`) }
  if (!row.bookName) throw new Error(`book_info.csv line ${lineNo}: bookName is empty`)
  return row
}

/**
 * columns הוא מספר העמודות שבקובץ (6 או 11); הייצוא שומר עליו עד שנשמר ערך בשדה הרחבה.
 * @param {string} text תוכן הקובץ
 * @returns {{columns: 6|11, rows: Map<string, object>}}
 */
export function parseBookInfoCsv(text) {
  if (text.includes('\r')) throw new Error('book_info.csv must use LF line endings')
  if (text.charCodeAt(0) === 0xfeff) throw new Error('book_info.csv must not start with a BOM')
  const [header, ...records] = parseRecords(text)
  const headerText = header?.join(',')
  if (headerText !== BOOK_INFO_COLUMNS.join(',') && headerText !== BOOK_INFO_ALL_COLUMNS.join(',')) {
    throw new Error(`book_info.csv header must be ${BOOK_INFO_COLUMNS.join(',')} or ${BOOK_INFO_ALL_COLUMNS.join(',')}`)
  }
  const columns = header.length
  const rows = new Map()
  for (const [i, cells] of records.entries()) {
    const lineNo = i + 2
    if (cells.length !== columns) throw new Error(`book_info.csv line ${lineNo}: expected ${columns} columns`)
    const row = toRow(cells, lineNo)
    const key = rowKey(row.bookName, row.authorName)
    if (rows.has(key)) throw new Error(`book_info.csv line ${lineNo}: duplicate book "${row.bookName}" by "${row.authorName}"`)
    rows.set(key, row)
  }
  return { columns, rows }
}

/**
 * מצב מתוך רשומות (למשל BookInfo מ-Mongo), באותה נורמליזציה של הקריאה מהקובץ: מחרוזת ריקה בדור
 * היא null, שם מחבר חסר הוא ''. ייצוא שלו הוא הקובץ הראשוני להעלאה ל-ForDB.
 */
export function bookInfoStateFromRows(records, { columns = BOOK_INFO_COLUMNS.length } = {}) {
  const rows = new Map()
  for (const record of records) {
    const row = {}
    for (const column of BOOK_INFO_ALL_COLUMNS) {
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
  return { columns: columns === BOOK_INFO_ALL_COLUMNS.length ? columns : BOOK_INFO_COLUMNS.length, rows }
}

const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

/** עמודות הייצוא: הפורמט שנקרא, ו-11 רק כשיש בו כבר 11 או כשנשמר ערך בשדה הרחבה. */
export function exportColumns(state) {
  return state.columns === BOOK_INFO_ALL_COLUMNS.length || [...state.rows.values()].some(hasExtensionValue) ? BOOK_INFO_ALL_COLUMNS : BOOK_INFO_COLUMNS
}

/** @param {ReturnType<typeof parseBookInfoCsv>} state */
export function exportBookInfoCsv(state) {
  const sorted = [...state.rows.values()].sort((a, b) => compare(a.bookName, b.bookName) || compare(a.authorName, b.authorName))
  const columns = exportColumns(state)
  const lines = [columns.join(',')]
  for (const row of sorted) {
    assertStorageRow(row)
    lines.push(columns.map((column) => quote(row[column])).join(','))
  }
  return lines.join('\n') + '\n'
}

/** עותק עמוק שאפשר לשנות בלי לגעת במצב השמור במטמון. */
export function cloneBookInfoState(state) {
  return { columns: state.columns, rows: new Map([...state.rows].map(([key, row]) => [key, { ...row }])) }
}

/** השורות לתצוגה, ממוינות כמו בקובץ. */
export function listBookInfo(state) {
  return [...state.rows.values()].sort((a, b) => compare(a.bookName, b.bookName) || compare(a.authorName, b.authorName))
}
