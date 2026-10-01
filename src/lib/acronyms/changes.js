/**
 * סל שינויים בכינויים: אימות, החלה על מצב הפורק, תכנון החלפה גורפת וסיכום ל-PR.
 *
 * הפעולות מזוהות לפי מפתחות טבעיים (שם הספר וטקסט הכינוי) ולא לפי id, כמו ב-EditLog של העורך
 * בפורק. כך אפשר להחיל אותן מחדש על כל master עדכני, ו-PR פתוח נבנה מחדש אחרי כל מיזוג.
 */
import { cloneState } from './dump.js'
import { aliasKey, aliasProblem, normalizeAlias, normalizeBookTitle } from './normalize.js'

export const MAX_OPS_PER_CHANGE_SET = 2000
const MAX_TITLE_LENGTH = 300

const maxKey = (map) => {
  let max = 0
  for (const k of map.keys()) if (k > max) max = k
  return max
}

/** אינדקסים על המצב, מתעדכנים יחד איתו — בלי סריקה של כל הקישורים לכל פעולה. */
function createIndex(state) {
  const bookIdByTitle = new Map()
  for (const [id, title] of state.books) bookIdByTitle.set(title, id)
  const acronymIdByText = new Map()
  for (const [id, text] of state.acronyms) acronymIdByText.set(text, id)
  const linkIdsByBook = new Map()
  const linkCountByAcronym = new Map()
  for (const [id, link] of state.links) {
    if (!linkIdsByBook.has(link.bookId)) linkIdsByBook.set(link.bookId, new Set())
    linkIdsByBook.get(link.bookId).add(id)
    linkCountByAcronym.set(link.acronymId, (linkCountByAcronym.get(link.acronymId) || 0) + 1)
  }
  const next = { books: maxKey(state.books) + 1, acronyms: maxKey(state.acronyms) + 1, links: maxKey(state.links) + 1 }
  return {
    bookIdByTitle,
    acronymIdByText,
    linksOf(bookId) {
      return [...(linkIdsByBook.get(bookId) || [])].sort((a, b) => a - b).map((id) => {
        const link = state.links.get(id)
        return { id, ...link, text: state.acronyms.get(link.acronymId) }
      })
    },
    addBook(title) {
      const id = next.books++
      state.books.set(id, title)
      bookIdByTitle.set(title, id)
      return id
    },
    acronymIdFor(text) {
      let id = acronymIdByText.get(text)
      if (id === undefined) {
        id = next.acronyms++
        state.acronyms.set(id, text)
        acronymIdByText.set(text, id)
      }
      return id
    },
    setLink(id, bookId, acronymId) {
      const old = state.links.get(id)
      if (old) this.deleteLink(id)
      state.links.set(id, { bookId, acronymId })
      if (!linkIdsByBook.has(bookId)) linkIdsByBook.set(bookId, new Set())
      linkIdsByBook.get(bookId).add(id)
      linkCountByAcronym.set(acronymId, (linkCountByAcronym.get(acronymId) || 0) + 1)
    },
    addLink(bookId, acronymId) {
      this.setLink(next.links++, bookId, acronymId)
    },
    deleteLink(id) {
      const link = state.links.get(id)
      state.links.delete(id)
      linkIdsByBook.get(link.bookId)?.delete(id)
      linkCountByAcronym.set(link.acronymId, linkCountByAcronym.get(link.acronymId) - 1)
    },
    isOrphan(acronymId) {
      return !linkCountByAcronym.get(acronymId)
    },
  }
}

/**
 * מאמת סל שהגיע מהדפדפן מול מצב הפורק, ומחזיר אותו מנורמל.
 * @returns {{ops:Array<object>}|{error:string}}
 */
export function validateChangeSet(rawOps, state) {
  if (!Array.isArray(rawOps) || rawOps.length === 0) return { error: 'הסל ריק' }
  if (rawOps.length > MAX_OPS_PER_CHANGE_SET) return { error: `בסל יותר מ-${MAX_OPS_PER_CHANGE_SET} שינויים` }
  const index = createIndex(cloneState(state))
  const ops = []
  for (const [i, raw] of rawOps.entries()) {
    const where = `שינוי ${i + 1}`
    const book = normalizeBookTitle(raw?.book)
    if (!book || book.length > MAX_TITLE_LENGTH) return { error: `${where}: שם ספר חסר או ארוך מדי` }
    const bookId = index.bookIdByTitle.get(book)
    const aliases = bookId === undefined ? [] : index.linksOf(bookId).map((l) => l.text)
    if (raw?.type === 'add') {
      if (bookId === undefined && raw.newBook !== true) return { error: `${where}: הספר "${book}" אינו ברשימה` }
      const alias = normalizeAlias(raw.alias)
      const problem = aliasProblem(alias, book)
      if (problem) return { error: `${where} (${book}): ${problem}` }
      ops.push({ type: 'add', book, alias, ...(bookId === undefined ? { newBook: true } : {}) })
    } else if (raw?.type === 'remove') {
      if (!aliases.includes(raw.alias)) return { error: `${where}: הכינוי "${raw.alias}" לא נמצא בספר "${book}"` }
      ops.push({ type: 'remove', book, alias: raw.alias })
    } else if (raw?.type === 'rename') {
      if (!aliases.includes(raw.from)) return { error: `${where}: הכינוי "${raw.from}" לא נמצא בספר "${book}"` }
      const to = normalizeAlias(raw.to)
      const problem = aliasProblem(to, book)
      if (problem) return { error: `${where} (${book}): ${problem}` }
      if (to === raw.from) return { error: `${where}: הכינוי החדש זהה לישן` }
      ops.push({ type: 'rename', book, from: raw.from, to })
    } else {
      return { error: `${where}: סוג שינוי לא מוכר` }
    }
  }
  return { ops }
}

/**
 * מחיל סל על עותק של המצב. פעולה שכבר אינה רלוונטית (הכינוי כבר נוסף, כבר נמחק) היא no-op,
 * כדי שהחלה חוזרת אחרי שינוי ב-master לא תיכשל.
 * @returns {{state:object, results:Array<{op:object, status:'applied'|'noop', reason?:string}>}}
 */
export function applyChangeSet(baseState, ops) {
  const state = cloneState(baseState)
  const index = createIndex(state)
  const touchedAcronyms = new Set()
  const results = []
  const hasKey = (bookId, text, exceptLinkId) =>
    index.linksOf(bookId).some((l) => l.id !== exceptLinkId && aliasKey(l.text) === aliasKey(text))

  for (const op of ops) {
    let bookId = index.bookIdByTitle.get(op.book)
    if (op.type === 'add') {
      if (bookId === undefined) bookId = index.addBook(op.book)
      if (hasKey(bookId, op.alias)) {
        results.push({ op, status: 'noop', reason: 'כבר קיים' })
        continue
      }
      index.addLink(bookId, index.acronymIdFor(op.alias))
      results.push({ op, status: 'applied' })
    } else if (op.type === 'remove') {
      const link = bookId === undefined ? null : index.linksOf(bookId).find((l) => l.text === op.alias)
      if (!link) {
        results.push({ op, status: 'noop', reason: 'כבר נמחק' })
        continue
      }
      index.deleteLink(link.id)
      touchedAcronyms.add(link.acronymId)
      results.push({ op, status: 'applied' })
    } else if (op.type === 'rename') {
      const link = bookId === undefined ? null : index.linksOf(bookId).find((l) => l.text === op.from)
      if (!link) {
        results.push({ op, status: 'noop', reason: 'הכינוי הישן כבר אינו קיים' })
        continue
      }
      touchedAcronyms.add(link.acronymId)
      if (hasKey(bookId, op.to, link.id)) {
        // השם החדש כבר קיים בספר — נשאר עותק אחד
        index.deleteLink(link.id)
        results.push({ op, status: 'applied', reason: 'אוחד עם כינוי קיים' })
      } else {
        // אותו id של קישור: ב-diff בפורק זו החלפת שורה ולא מחיקה והוספה
        index.setLink(link.id, bookId, index.acronymIdFor(op.to))
        results.push({ op, status: 'applied' })
      }
    }
  }

  // כינוי שאיבד את הקישור האחרון שלו נמחק: הבדיקה בפורק (validate-db.sh) דוחה כינויים יתומים.
  for (const id of touchedAcronyms) {
    if (index.isOrphan(id) && state.acronyms.has(id)) {
      index.acronymIdByText.delete(state.acronyms.get(id))
      state.acronyms.delete(id)
    }
  }
  return { state, results }
}

/**
 * כינוי קבוע למילה: לכל ספר ששמו או אחד מכינוייו כוללים את `find` מתווסף כינוי חדש
 * שבו `find` מוחלף ב-`replace` (למשל "אותיות דרבי עקיבא" ← "אותיות דרבי עקיבה").
 * המקור נשאר כמות שהוא; הכינוי החדש רק נוסף לצידו. לתצוגה מקדימה לפני הוספה לסל.
 * @param {Array<{title:string, aliases:string[]}>} books
 * @returns {Array<{book:string, from:string, to:string, problem:string|null}>}
 */
export function planAddAliases(books, find, replace) {
  const needle = String(find ?? '')
  if (!needle.trim()) return []
  const out = []
  for (const book of books) {
    const existing = new Set(book.aliases.map(aliasKey))
    const seen = new Set()
    for (const source of [book.title, ...book.aliases]) {
      if (!source.includes(needle)) continue
      const to = normalizeAlias(source.split(needle).join(String(replace ?? '')))
      const key = aliasKey(to)
      if (seen.has(key)) continue
      seen.add(key)
      const problem = aliasProblem(to, book.title) || (existing.has(key) ? 'הכינוי כבר קיים בספר' : null)
      out.push({ book: book.title, from: source, to, problem })
    }
  }
  return out
}

// תא בטבלת markdown: כינוי כקוד, בלי ש-| או ` ישברו את הטבלה
function cell(text) {
  const safe = String(text).replace(/\|/g, '\\|')
  return safe.includes('`') ? safe : `\`${safe}\``
}

const ACTION = { add: '➕ הוספה', remove: '➖ מחיקה', rename: '✏️ עריכה' }

function row(r, bookCell) {
  const { op } = r
  const before = op.type === 'add' ? '' : op.type === 'remove' ? `~~${cell(op.alias)}~~` : cell(op.from)
  const after = op.type === 'remove' ? '' : cell(op.type === 'add' ? op.alias : op.to)
  const note = r.reason ? ` _(${r.reason})_` : ''
  return `| ${bookCell} | ${ACTION[op.type]} | ${before} | ${after}${note} |`
}

function bookRows(byBook, keep) {
  const rows = []
  for (const [book, list] of byBook) {
    const mine = list.filter(keep)
    const label = `**${book.replace(/\|/g, '\\|')}**${mine.some((r) => r.op.newBook) ? ' _(ספר חדש)_' : ''}`
    mine.forEach((r, i) => rows.push(row(r, i === 0 ? label : '')))
  }
  return rows
}

/**
 * גוף PR בעברית: טבלת לפני/אחרי לפי ספר, מחיקה בקו חוצה, ופעולות בלי השפעה מקופלות בסוף.
 * maxLength מקצר בשורות שלמות, כדי שהטבלה לא תישבר באמצע.
 */
export function summarizeChangeSet(results, { maxLength = Infinity } = {}) {
  const byBook = new Map()
  for (const r of results) {
    const list = byBook.get(r.op.book) || []
    list.push(r)
    byBook.set(r.op.book, list)
  }
  const counts = { add: 0, remove: 0, rename: 0, noop: 0 }
  for (const r of results) counts[r.status === 'applied' ? r.op.type : 'noop']++
  const applied = counts.add + counts.remove + counts.rename
  const books = new Set(results.filter((r) => r.status === 'applied').map((r) => r.op.book)).size
  const head = `**${applied} שינויים ב-${books} ספרים**: ${counts.add} הוספות, ${counts.remove} מחיקות, ${counts.rename} עריכות` +
    (counts.noop ? `; ועוד ${counts.noop} ללא השפעה.` : '.')
  const TABLE = ['| ספר | פעולה | לפני | אחרי |', '|---|---|---|---|']
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
  let complete = applied === 0 || push([...TABLE, ...bookRows(byBook, (r) => r.status === 'applied')])
  if (complete && counts.noop) {
    complete = push(['', `<details><summary>${counts.noop} שינויים שכבר היו במצב המבוקש</summary>`, '', ...TABLE, ...bookRows(byBook, (r) => r.status !== 'applied'), '', '</details>'])
    if (!complete) lines.push('', '</details>')
  }
  return { text: lines.join('\n') + (complete ? '' : NOTE), counts, books }
}
