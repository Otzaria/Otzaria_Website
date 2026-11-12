/** קריאת מקורות "עבר הגהה באוצריא" מ-Mongo; החישוב עצמו ב-proofread.js. */
import ErrorReport from '../../models/ErrorReport.js'
import BookEdit from '../../models/BookEdit.js'
import Book from '../../models/Book.js'
import PageProofBook from '../../models/PageProofBook.js'
import PageProofPage from '../../models/PageProofPage.js'
import { proofreadBookNames } from './proofread.js'

const CACHE_MS = 10 * 60_000
const cache = (globalThis.__bookInfoProofread ??= { at: 0, names: null, inflight: null })

export async function loadProofreadSources() {
  const [correctionTitles, editedPaths, completedBooks, openPageProofBooks] = await Promise.all([
    ErrorReport.distinct('bookTitle', { $or: [{ state: 'closed_published' }, { 'publish.status': 'committed' }, { 'inclusion.status': { $in: ['merged_to_main', 'included_in_release'] } }] }),
    // applied חסר בעריכות שקדמו לשדה; false = אושרה אך לא הוחלה בגלל התנגשות
    BookEdit.distinct('bookPath', { status: 'approved', applied: { $ne: false } }),
    Book.find({ isPrivate: { $ne: true }, totalPages: { $gt: 0 }, $expr: { $gte: ['$completedPages', '$totalPages'] } }).distinct('name'),
    PageProofPage.distinct('book', { status: { $ne: 'done' } }),
  ])
  const pageProofTitles = await PageProofBook.find({ _id: { $nin: openPageProofBooks }, pageCount: { $gt: 0 } }).distinct('title')
  return { correctionTitles, editedPaths, completedBooks, pageProofTitles }
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
