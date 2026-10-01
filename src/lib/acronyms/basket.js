/**
 * סל השינויים בדף הכינויים (בצד הדפדפן): צירוף שינויים שמבטלים זה את זה, ותצוגת ספר עם הסל.
 * השרת מאמת שוב הכל מול הפורק (validateChangeSet), כך שהסל כאן רק חוסך שליחה של רעש.
 */
import { aliasKey, normalizeAlias } from './normalize.js'

const same = (a, b) => aliasKey(a) === aliasKey(b)

/**
 * מוסיף שינוי לסל ומחזיר סל חדש.
 * @param {Array<object>} basket
 * @param {{type:'add'|'remove'|'rename', book:string, alias?:string, from?:string, to?:string, newBook?:boolean}} op
 */
export function addToBasket(basket, op) {
  const others = basket.filter((o) => o.book !== op.book)
  let mine = basket.filter((o) => o.book === op.book)

  if (op.type === 'add') {
    const alias = normalizeAlias(op.alias)
    const undone = mine.find((o) => o.type === 'remove' && same(o.alias, alias))
    if (undone) return [...others, ...mine.filter((o) => o !== undone)]
    if (mine.some((o) => (o.type === 'add' && same(o.alias, alias)) || (o.type === 'rename' && same(o.to, alias)))) return basket
    return [...basket, { type: 'add', book: op.book, alias, ...(op.newBook ? { newBook: true } : {}) }]
  }

  if (op.type === 'remove') {
    const added = mine.find((o) => o.type === 'add' && o.alias === op.alias)
    if (added) return [...others, ...mine.filter((o) => o !== added)]
    const renamed = mine.find((o) => o.type === 'rename' && (o.from === op.alias || o.to === op.alias))
    if (renamed) mine = mine.filter((o) => o !== renamed)
    const alias = renamed ? renamed.from : op.alias
    if (mine.some((o) => o.type === 'remove' && o.alias === alias)) return [...others, ...mine]
    return [...others, ...mine, { type: 'remove', book: op.book, alias }]
  }

  const to = normalizeAlias(op.to)
  const added = mine.find((o) => o.type === 'add' && o.alias === op.from)
  if (added) return [...others, ...mine.map((o) => (o === added ? { ...o, alias: to } : o))]
  const renamed = mine.find((o) => o.type === 'rename' && (o.from === op.from || o.to === op.from))
  if (renamed) {
    if (renamed.from === to) return [...others, ...mine.filter((o) => o !== renamed)] // חזרה לשם המקורי
    return [...others, ...mine.map((o) => (o === renamed ? { ...o, to } : o))]
  }
  return [...basket, { type: 'rename', book: op.book, from: op.from, to }]
}

/** מסיר פריט מהסל לפי מיקומו. */
export function removeFromBasket(basket, index) {
  return basket.filter((_, i) => i !== index)
}

/**
 * הכינויים של ספר כפי שייראו אחרי הסל.
 * @returns {Array<{text:string, from?:string, state:'kept'|'added'|'removed'|'renamed'}>}
 */
export function bookView(aliases, basket, book) {
  const mine = basket.filter((o) => o.book === book)
  const chips = aliases.map((text) => {
    if (mine.some((o) => o.type === 'remove' && o.alias === text)) return { text, state: 'removed' }
    const renamed = mine.find((o) => o.type === 'rename' && o.from === text)
    if (renamed) return { text: renamed.to, from: text, state: 'renamed' }
    return { text, state: 'kept' }
  })
  for (const o of mine) if (o.type === 'add') chips.push({ text: o.alias, state: 'added' })
  return chips
}

/** הפעולות לשליחה לשרת, בלי שדות תצוגה. */
export function basketOps(basket) {
  return basket.map(({ type, book, alias, from, to, newBook }) => {
    if (type === 'add') return { type, book, alias, ...(newBook ? { newBook: true } : {}) }
    if (type === 'remove') return { type, book, alias }
    return { type, book, from, to }
  })
}

/** הכינויים שעוד לא בפורק: הוספות ועריכות מהסל ומ-PR-ים פתוחים, לפי ספר. */
export function unmergedAliases(basket, pending) {
  const map = new Map()
  const ops = [...basket, ...pending.flatMap((cs) => cs.ops || [])]
  for (const op of ops) {
    const alias = op.type === 'add' ? op.alias : op.type === 'rename' ? op.to : null
    if (!alias) continue
    if (!map.has(op.book)) map.set(op.book, [])
    map.get(op.book).push(alias)
  }
  return map
}

/** חיפוש ספרים לפי שם או כינוי, כולל כינויים שבסל ובבקשות פתוחות, בלי הבדלי גרשיים. */
export function filterBooks(books, query, extraAliases = new Map()) {
  const q = aliasKey(query)
  if (!q) return books
  const matches = (a) => aliasKey(a).includes(q)
  return books.filter((b) => matches(b.title) || b.aliases.some(matches) || (extraAliases.get(b.title) || []).some(matches))
}
