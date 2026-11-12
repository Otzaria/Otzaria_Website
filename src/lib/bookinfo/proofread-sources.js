/** קריאת מקורות "עבר הגהה באוצריא" מ-Mongo; החישוב עצמו ב-proofread.js. */
import BookEdit from '../../models/BookEdit.js'
import Book from '../../models/Book.js'
import PageProofBook from '../../models/PageProofBook.js'
import PageProofPage from '../../models/PageProofPage.js'
import { proofreadBookNames } from './proofread.js'

const CACHE_MS = 10 * 60_000
const cache = (globalThis.__bookInfoProofread ??= { at: 0, names: null, inflight: null })

export async function loadProofreadSources() {
  // תיקון טעות נקודתי לא מסמן ספר כמוגה; רק עבודה על הספר כולו.
  const [editedPaths, completedBooks, openPageProofBooks] = await Promise.all([
    // applied חסר בעריכות שקדמו לשדה; false = אושרה אך לא הוחלה בגלל התנגשות
    BookEdit.distinct('bookPath', { status: 'approved', applied: { $ne: false } }),
    Book.find({ isPrivate: { $ne: true }, totalPages: { $gt: 0 }, $expr: { $gte: ['$completedPages', '$totalPages'] } }).distinct('name'),
    PageProofPage.distinct('book', { status: { $ne: 'done' } }),
  ])
  const pageProofTitles = await PageProofBook.find({ _id: { $nin: openPageProofBooks }, pageCount: { $gt: 0 } }).distinct('title')
  return { editedPaths, completedBooks, pageProofTitles }
}

/** שמות הספרים המוגהים, במטמון קצר כדי שדף המידע לא יריץ את השאילתות בכל טעינה. */
export async function getProofreadBookNames({ fresh = false } = {}) {
  if (!fresh && cache.names && Date.now() - cache.at < CACHE_MS) return cache.names
  cache.inflight ??= loadProofreadSources().then((sources) => {
    cache.names = proofreadBookNames(sources)
    cache.at = Date.now()
    return cache.names
  }).finally(() => { cache.inflight = null })
  return cache.inflight
}
