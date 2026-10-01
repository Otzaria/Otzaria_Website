/**
 * תכנון העברה חד-פעמית של כינויים שמתנדבים הכניסו לאתר (Mongo) לפורק, כ-PR-ים נפרדים:
 *   - הצעות שעוד ממתינות לאישור — PR לכל מתנדב;
 *   - כינויים שאושרו באתר וחסרים בפורק — PR לכל קטגוריה, מפוצל לחלקים בני גודל סביר.
 * מזהה הספר באתר (externalId) אינו מזהה של הפורק, ולכן ההתאמה היא לפי שם הספר המדויק.
 */
import { aliasKey, aliasProblem, normalizeAlias } from './normalize.js'

export const DEFAULT_CHUNK_SIZE = 200

const titleKey = (title) => String(title).replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim()

// בפורק שמות הספרים בלי גרשיים ("מהרם"), ובאתר איתם ("מהר"ם"); נופלים לזה רק כשההתאמה חד-משמעית
function forkIndex(forkBooks) {
  const exact = new Map(forkBooks.map((b) => [b.title, b]))
  const loose = new Map()
  for (const b of forkBooks) {
    const k = titleKey(b.title)
    loose.set(k, loose.has(k) ? null : b)
  }
  return { get: (title) => exact.get(title) || loose.get(titleKey(title)) || undefined }
}

const hasAlias = (book, alias) => book.aliases.some((a) => aliasKey(a) === aliasKey(alias))

/**
 * @param {Array<{_id:any, bookDisplayName:string, actionType:string, currentAlias?:string, nextAlias?:string, alias?:string, submittedBy:any}>} suggestions
 * @param {Array<{title:string, aliases:string[]}>} forkBooks
 * @returns {{groups:Array<{submittedBy:string, ops:object[], pendingIds:string[]}>, skipped:Array<{id:string, reason:string}>}}
 */
export function planPendingMigration(suggestions, forkBooks) {
  const index = forkIndex(forkBooks)
  const groups = new Map()
  const skipped = []
  for (const s of suggestions) {
    const id = String(s._id)
    const book = index.get(s.bookDisplayName)
    if (!book) {
      skipped.push({ id, reason: `הספר "${s.bookDisplayName}" לא נמצא בפורק` })
      continue
    }
    const next = normalizeAlias(s.nextAlias || s.alias)
    let op = null
    if (s.actionType === 'delete') {
      if (book.aliases.includes(s.currentAlias)) op = { type: 'remove', book: book.title, alias: s.currentAlias }
      else skipped.push({ id, reason: 'הכינוי למחיקה אינו בפורק' })
    } else if (s.actionType === 'update' && book.aliases.includes(s.currentAlias)) {
      op = { type: 'rename', book: book.title, from: s.currentAlias, to: next }
    } else if (hasAlias(book, next)) {
      skipped.push({ id, reason: 'הכינוי כבר בפורק' })
    } else {
      op = { type: 'add', book: book.title, alias: next }
    }
    if (op && op.type !== 'remove') {
      const problem = aliasProblem(op.type === 'add' ? op.alias : op.to, book.title)
      if (problem) {
        skipped.push({ id, reason: problem })
        op = null
      }
    }
    if (!op) continue
    const key = String(s.submittedBy)
    if (!groups.has(key)) groups.set(key, { submittedBy: key, ops: [], pendingIds: [] })
    groups.get(key).ops.push(op)
    groups.get(key).pendingIds.push(id)
  }
  return { groups: [...groups.values()], skipped }
}

/** הקטגוריה העליונה מתוך bookPath של האתר ("אוצריא/תנך/תורה/..." ← "תנך"). */
export function topCategory(bookPath) {
  const parts = String(bookPath || '').split(/[\\/]/).map((p) => p.trim()).filter(Boolean)
  const i = parts[0] === 'אוצריא' ? 1 : 0
  return parts.length > i + 1 ? parts[i] : 'ללא קטגוריה'
}

/**
 * @param {Array<{displayName:string, bookPath?:string, aliases:string[]}>} siteBooks
 * @param {Array<{title:string, aliases:string[]}>} forkBooks
 * @returns {{groups:Array<{label:string, ops:object[], books:number}>, unmatched:Array<{title:string, category:string, ops:object[]}>, skipped:number}}
 */
export function planApprovedMigration(siteBooks, forkBooks, { chunkSize = DEFAULT_CHUNK_SIZE } = {}) {
  const index = forkIndex(forkBooks)
  const byCategory = new Map()
  const unmatched = []
  let skipped = 0
  for (const site of siteBooks) {
    const title = site.displayName
    if (!title) continue
    const fork = index.get(title)
    const known = fork ? [...fork.aliases] : []
    const ops = []
    for (const raw of site.aliases || []) {
      const alias = normalizeAlias(raw)
      if (aliasProblem(alias, title) || known.some((a) => aliasKey(a) === aliasKey(alias))) {
        skipped++
        continue
      }
      known.push(alias)
      ops.push(fork ? { type: 'add', book: fork.title, alias } : { type: 'add', book: title, alias, newBook: true })
    }
    if (ops.length === 0) continue
    const category = topCategory(site.bookPath)
    if (!fork) {
      unmatched.push({ title, category, ops })
      continue
    }
    // "שו"ת" ו"שות" הם אותה תיקייה בכתיבים שונים
    const key = titleKey(category)
    if (!byCategory.has(key)) byCategory.set(key, { category, perBook: [] })
    byCategory.get(key).perBook.push(ops)
  }

  const groups = []
  for (const { category, perBook } of [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category, 'he'))) {
    // ספר אינו מתפצל בין שני PR-ים, כדי שהבודק יראה את כל הכינויים שלו יחד
    const chunks = [[]]
    for (const ops of perBook) {
      const current = chunks[chunks.length - 1]
      if (current.length > 0 && current.length + ops.length > chunkSize) chunks.push([])
      chunks[chunks.length - 1].push(...ops)
    }
    chunks.forEach((ops, i) => {
      const label = chunks.length > 1 ? `${category}, חלק ${i + 1} מתוך ${chunks.length}` : category
      groups.push({ label, ops, books: new Set(ops.map((o) => o.book)).size })
    })
  }
  return { groups, unmatched, skipped }
}
