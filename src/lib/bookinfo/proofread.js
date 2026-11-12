/**
 * סימון "עבר הגהה באוצריא" (עמודת proofread ב-book_info.csv): חישוב טהור מתוך מקורות האתר,
 * ובניית בקשת השינוי המערכתית המרוכזת שמעדכנת את הקובץ.
 */
import { listBookInfo, rowKey } from './csv.js'
import { MAX_OPS_PER_CHANGE_SET } from './changes.js'

/** bookKey של בקשת המערכת. אינו מפתח של ספר, ולכן אינו חוסם עריכת משתמש באף ספר. */
export const PROOFREAD_CHANGE_SET_KEY = 'system:proofread'
export const PROOFREAD_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000

export const isProofreadChangeSet = (doc) => doc?.bookKey === PROOFREAD_CHANGE_SET_KEY

/** שם הספר מנתיב בספרייה ("הלכה/אחרונים/דרך החיים.txt" ← "דרך החיים"). */
export function bookNameFromPath(value) {
  if (typeof value !== 'string') return ''
  return value.split(/[\\/]/).pop().replace(/\.txt$/i, '').trim()
}

/**
 * שמות הספרים שעברו הגהה או עריכה באוצריא.
 * @param {{correctionTitles?: string[], editedPaths?: string[], completedBooks?: string[], pageProofTitles?: string[]}} sources
 * correctionTitles - ספרים עם תיקון טעות שפורסם; editedPaths - נתיבי ספרים עם עריכה שאושרה;
 * completedBooks - ספרי הקלדה שכל עמודיהם הושלמו; pageProofTitles - ספרי הגהת עמודים שהסתיימו.
 * @returns {Set<string>}
 */
export function proofreadBookNames({ correctionTitles = [], editedPaths = [], completedBooks = [], pageProofTitles = [] } = {}) {
  const names = new Set()
  for (const value of [...correctionTitles, ...editedPaths, ...completedBooks, ...pageProofTitles]) {
    const name = bookNameFromPath(value)
    if (name) names.add(name)
  }
  return names
}

/**
 * פעולות הבקשה המערכתית: שורה אחת לכל ספר שחושב כמוגה ועדיין לא מסומן בכל שורותיו (ההחלה כותבת
 * לכל שורות הספר). ספר ב-skipBooks (יש לו בקשת משתמש פעילה) נדחה לסבב הבא. רק מוסיף סימון, לא מוחק.
 */
export function proofreadOps(state, names, { skipBooks = new Set(), identityRevision = 0, limit = MAX_OPS_PER_CHANGE_SET } = {}) {
  const byBook = new Map()
  for (const row of listBookInfo(state)) {
    if (!byBook.has(row.bookName)) byBook.set(row.bookName, [])
    byBook.get(row.bookName).push(row)
  }
  const ops = []
  for (const [book, rows] of byBook) {
    if (ops.length >= limit) break
    if (!names.has(book) || skipBooks.has(book) || rows.every((row) => row.proofread === '1')) continue
    const [row] = rows
    ops.push({ type: 'update', book, author: row.authorName, changes: { proofread: '1' }, baseRow: { ...row }, identityRevision })
  }
  return ops
}

/** איחוד פעולות לפי ספר: פעולה קיימת נשמרת (עם זהותה), וחדשה נוספת רק לספר שאין לו פעולה. */
export function mergeProofreadOps(existing, fresh) {
  const books = new Set(existing.map((op) => op.book))
  return [...existing, ...fresh.filter((op) => !books.has(op.book))].slice(0, MAX_OPS_PER_CHANGE_SET)
}

/** מפתח להשוואת קבוצות השורות של שתי רשימות פעולות. */
export function proofreadOpsKey(ops) {
  return ops.map((op) => rowKey(op.book, op.author)).sort().join('\n')
}
