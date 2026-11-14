// "עמודים לאימון" (/library/admin/ocr-training) — הסינון מהכתובת ואליה, המונים, העמוד ובדיקת טופס "הוסף עמוד".
// לוגיקה טהורה (נבדק ב-trainingScreens.test.mjs). השרת (GET /api/admin/ocr-training, בלי שינוי) מחזיר את כל
// העמודים בבת אחת — הסינון והחלוקה לעמודים בדפדפן.
import { paginate as paginateList } from '../adminList/paginate.js'
import { formatNumber } from '../adminTerms.js'
import { SCRIPT_TYPES, oneOf, pageParam, reader, serializeParams } from './trainingTerms.js'

export const TRAINING_PAGES_PER_PAGE = 50
/** המצבים של עמוד לאימון (כמו בשרת), בסדר התצוגה */
export const TRAINING_STATUSES = ['available', 'in-progress', 'completed']

/** @typedef {{ script: string, status: string, page: number }} TrainingPagesQuery */

/** @returns {TrainingPagesQuery} */
export function parseTrainingPagesQuery(params) {
  const get = reader(params)
  return {
    script: oneOf(get('script'), SCRIPT_TYPES, ''),
    status: oneOf(get('status'), TRAINING_STATUSES, ''),
    page: pageParam(get('page')),
  }
}

/** @param {TrainingPagesQuery} query */
export function serializeTrainingPagesQuery(query) {
  return serializeParams([
    ['script', query.script, ''],
    ['status', query.status, ''],
    ['page', query.page, 1],
  ])
}

/** שינוי סינון — חזרה לעמוד הראשון (חוץ משינוי העמוד עצמו) */
export function updateTrainingPagesQuery(query, patch) {
  return { ...query, ...patch, page: 'page' in patch ? patch.page : 1 }
}

const scriptOf = (p) => (p?.scriptType === 'rashi' ? 'rashi' : 'square')
const statusOf = (p) => oneOf(p?.status, TRAINING_STATUSES, 'available')

/** העמודים שמתאימים לסינון — בסדר שהשרת החזיר (החדש ראשון) */
export function filterTrainingPages(pages, query) {
  return (pages || []).filter((p) => (!query.script || scriptOf(p) === query.script) && (!query.status || statusOf(p) === query.status))
}

export function paginate(items, page, size = TRAINING_PAGES_PER_PAGE) {
  return paginateList(items, page, size)
}

/**
 * שורת המונים: לכל סוג כתב — כמה עמודים בכל מצב, ובסך הכול כמה שורות עם טקסט.
 * @returns {{ total: number, filledLines: number, byScript: Record<string, { total: number, available: number, 'in-progress': number, completed: number }> }}
 */
export function trainingCounts(pages) {
  const byScript = Object.fromEntries(SCRIPT_TYPES.map((s) => [s, { total: 0, available: 0, 'in-progress': 0, completed: 0 }]))
  let filledLines = 0
  for (const p of pages || []) {
    const bucket = byScript[scriptOf(p)]
    bucket.total += 1
    bucket[statusOf(p)] += 1
    filledLines += Number(p?.filledLines) || 0
  }
  return { total: (pages || []).length, filledLines, byScript }
}

/** "12/20 שורות" — כמה שורות עם טקסט מתוך היעד */
export function linesProgressText(p) {
  return `${formatNumber(p?.filledLines || 0)} מתוך ${formatNumber(p?.targetLines || 0)}`
}
/**
 * מי עובד / עבד על העמוד (claimedByName — השרת משאיר אותו גם אחרי שהעמוד הושלם): "בעבודה אצל" / "הושלם בידי".
 * @returns {{ label: string, name: string } | null}
 */
export function workerOf(p) {
  if (!p?.claimedByName) return null
  if (p.status === 'completed') return { label: 'הושלם בידי', name: p.claimedByName }
  if (p.status === 'in-progress') return { label: 'בעבודה אצל', name: p.claimedByName }
  return null
}
/** "שחרר": מה יקרה — לעמוד שהושלם (יחזור לפנוי ויצא מההורדה) ולעמוד שבעבודה */
export function releaseText(p) {
  if (p?.status === 'completed') {
    return 'העמוד יחזור להיות פנוי, ולא ייכלל בהורדת השורות מעמודים שהושלמו עד שמתנדב יסיים אותו שוב. השורות שסומנו נשארות.'
  }
  if (p?.claimedByName) return `${p.claimedByName} כבר לא יוכל להמשיך בעמוד, והעמוד יחזור להיות פנוי. השורות שסומנו נשארות.`
  return 'העמוד יחזור להיות פנוי. השורות שסומנו נשארות.'
}
/** העמוד הגיע ליעד השורות */
export function linesDone(p) {
  return (p?.filledLines || 0) >= (p?.targetLines || 0) && (p?.targetLines || 0) > 0
}

/**
 * בדיקת טופס "הוסף עמוד" לפני שליחה — אותן בדיקות כמו במסך הקודם.
 * @param {{ book: { id: string, totalPages?: number } | null, pageNumber: string }} form
 * @returns {{ error: string } | { body: { bookId: string, pageNumber: number } }}
 */
export function validateAddPage({ book, pageNumber }) {
  if (!book) return { error: 'בחר ספר.' }
  const text = String(pageNumber ?? '').trim()
  const n = /^\d+$/.test(text) ? Number(text) : NaN
  if (!Number.isInteger(n) || n < 1) return { error: 'הקלד מספר עמוד (1 ומעלה).' }
  if (book.totalPages && n > book.totalPages) return { error: `לספר יש ${formatNumber(book.totalPages)} עמודים בלבד.` }
  return { body: { bookId: book.id, pageNumber: n } }
}
