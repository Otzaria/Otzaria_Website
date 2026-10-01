/**
 * קריאה וכתיבה של ForDB/book_info.csv בריפו Otzaria/otzaria-library.
 *
 * הפורמט הקנוני: שורת כותרת קבועה, כל שדה במירכאות (כמו csv.QUOTE_ALL של Python שבו הריפו
 * עורך את קובצי ה-CSV שלו), סופי שורה LF, UTF-8 בלי BOM, ושורה אחת לכל ספר ממוינת לפי שם הספר
 * ואחריו שם המחבר. הייצוא כאן תמיד קנוני, כדי ש-PR מהאתר ייראה כשינוי של השורות שנגענו בהן בלבד.
 * הקריאה סלחנית יותר (סדר שורות ומירכאות חופשיים), והקובץ ייכתב מחדש בצורה הקנונית בקומיט הראשון.
 */

export const BOOK_INFO_COLUMNS = ['bookName', 'authorName', 'generationName', 'subGenerationName', 'startYear', 'endYear']

const TEXT_FIELDS = ['bookName', 'authorName', 'generationName', 'subGenerationName']

/** מפתח הזהות של שורה: אותו זוג (ספר, מחבר) שהאינדקס הייחודי ב-Mongo משתמש בו. */
export const rowKey = (bookName, authorName) => `${bookName}\u0000${authorName || ''}`

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function parseRecords(text) {
  const records = []
  let record = []
  let field = ''
  let quoted = false
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
      } else {
        field += ch
      }
    } else if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === ',') {
      record.push(field)
      field = ''
    } else if (ch === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += ch
    }
    i++
  }
  if (quoted) throw new Error('book_info.csv has an unterminated quoted field')
  if (field !== '' || record.length > 0) {
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
    const key = rowKey(row.bookName, row.authorName)
    if (rows.has(key)) throw new Error(`book_info.csv line ${lineNo}: duplicate book "${row.bookName}" by "${row.authorName}"`)
    rows.set(key, row)
  }
  return { rows }
}

const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

/** @param {ReturnType<typeof parseBookInfoCsv>} state */
export function exportBookInfoCsv(state) {
  const sorted = [...state.rows.values()].sort((a, b) => compare(a.bookName, b.bookName) || compare(a.authorName, b.authorName))
  const lines = [BOOK_INFO_COLUMNS.join(',')]
  for (const row of sorted) lines.push(BOOK_INFO_COLUMNS.map((column) => quote(row[column])).join(','))
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
