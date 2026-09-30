/**
 * קריאה וכתיבה של data/acronymizer.sql בפורק Otzaria/SeforimAcronymizer.
 *
 * הפורמט הקנוני הוא הפלט של scripts/export-canonical.sh שם: כותרת קבועה, שורת INSERT אחת
 * לכל רשומה ממוינת לפי id בכל טבלה, ו-COMMIT. הייצוא כאן חייב להיות זהה לו בבתים — אחרת
 * כל PR מהאתר ייראה כשכתוב של כל הקובץ ובדיקת ההבדלים בפורק תאבד משמעות.
 */

const ROW_RE = {
  Books: /^INSERT INTO Books\(id,title\) VALUES\((\d+),'((?:[^']|'')*)'\);$/,
  Acronyms: /^INSERT INTO Acronyms\(id,acronym\) VALUES\((\d+),'((?:[^']|'')*)'\);$/,
  BookAcronyms: /^INSERT INTO BookAcronyms\(id,book_id,acronym_id\) VALUES\((\d+),(\d+),(\d+)\);$/,
}

const FOOTER = 'COMMIT;\n'

const unquote = (s) => s.replace(/''/g, "'")
const quote = (s) => s.replace(/'/g, "''")

/**
 * @param {string} text תוכן הקובץ
 * @returns {{header:string, books:Map<number,string>, acronyms:Map<number,string>, links:Map<number,{bookId:number, acronymId:number}>}}
 */
export function parseDump(text) {
  if (text.includes('\r')) throw new Error('acronymizer.sql must use LF line endings')
  const firstInsert = text.indexOf('\nINSERT INTO ')
  if (firstInsert < 0) throw new Error('acronymizer.sql has no rows')
  if (!text.endsWith(FOOTER)) throw new Error('acronymizer.sql must end with COMMIT;')
  const header = text.slice(0, firstInsert + 1)
  const body = text.slice(firstInsert + 1, text.length - FOOTER.length)

  const books = new Map()
  const acronyms = new Map()
  const links = new Map()
  let lineNo = header.split('\n').length - 1
  for (const line of body.split('\n')) {
    lineNo++
    if (line === '') continue
    let m
    if ((m = ROW_RE.Books.exec(line))) books.set(Number(m[1]), unquote(m[2]))
    else if ((m = ROW_RE.Acronyms.exec(line))) acronyms.set(Number(m[1]), unquote(m[2]))
    else if ((m = ROW_RE.BookAcronyms.exec(line))) links.set(Number(m[1]), { bookId: Number(m[2]), acronymId: Number(m[3]) })
    else throw new Error(`acronymizer.sql line ${lineNo} is not a canonical row`)
  }
  return { header, books, acronyms, links }
}

const byId = (map) => [...map.entries()].sort(([a], [b]) => a - b)

/** @param {ReturnType<typeof parseDump>} state */
export function exportDump(state) {
  const out = [state.header]
  for (const [id, title] of byId(state.books)) out.push(`INSERT INTO Books(id,title) VALUES(${id},'${quote(title)}');\n`)
  for (const [id, acronym] of byId(state.acronyms)) out.push(`INSERT INTO Acronyms(id,acronym) VALUES(${id},'${quote(acronym)}');\n`)
  for (const [id, link] of byId(state.links)) out.push(`INSERT INTO BookAcronyms(id,book_id,acronym_id) VALUES(${id},${link.bookId},${link.acronymId});\n`)
  out.push(FOOTER)
  return out.join('')
}

/** עותק עמוק שאפשר לשנות בלי לגעת במצב השמור במטמון. */
export function cloneState(state) {
  return {
    header: state.header,
    books: new Map(state.books),
    acronyms: new Map(state.acronyms),
    links: new Map([...state.links].map(([id, l]) => [id, { ...l }])),
  }
}

/** ספרים וכינויים בסדר הקישור, כפי שהמחולל של SeforimLibrary קורא אותם. */
export function listBooks(state) {
  const aliasesByBook = new Map()
  for (const [, link] of byId(state.links)) {
    const acronym = state.acronyms.get(link.acronymId)
    if (acronym === undefined) continue
    const list = aliasesByBook.get(link.bookId) || []
    list.push(acronym)
    aliasesByBook.set(link.bookId, list)
  }
  return byId(state.books).map(([id, title]) => ({ id, title, aliases: aliasesByBook.get(id) || [] }))
}
