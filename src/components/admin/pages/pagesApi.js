// הבקשות של "עמודים" לשרת — אותן נקודות קצה, אותן כתובות ואותו גוף כמו במסך הקודם (בלי שינוי בהן):
//   GET /api/admin/pages/list?status=&book=&userId=      הרשימה (השרת מחזיר עד 5,000 בבקשה; ההמשך — &page=2, 3…,
//                                                          פרמטר שהשרת כבר מקבל)
//   GET /api/admin/pages/filter-options                   הספרים והמשתמשים לבוררים
//   PUT /api/admin/pages/update                           שחרור: { bookName, pageNumber, updates: { status: 'available', claimedBy: null, claimedAt: null } }
//                                                          שינוי מצב: { bookName, pageNumber, updates: { status } } (כמו "ערוך סטטוס" הקודם)
//   GET /api/admin/pages/download/:id                     הטקסט של עמוד
//   GET /api/admin/pages/download-batch?status=&book=&userId=   כל המסוננים בקובץ אחד (קישור הורדה, כמו "הכל"); עם
//                                                          ספר — כל העמודים שלו בבקשה אחת (הורדה של עמודים רבים מאותו ספר)
//
// מגבלה של ה-API: השרת מזהה ספר לפי השם בלבד (Book.findOne({ name }) — השם אינו ייחודי במסד, רק slug), והרשימה לא
// מחזירה מזהה ספר. אם יהיו שני ספרים באותו שם, השחרור, שינוי המצב, "פתח בעורך" והבדיקה לפני שליחה יפנו לראשון.
// (במסד היום אין שמות כפולים.) תיקון אמיתי דורש שינוי ב-API.

import { AdminApiError, requestBlob, requestJson, saveBlob, startDownload } from '@/components/admin/list/adminRequest'
import { batchDownloadUrl, listUrl, mergeParts, moreParts } from '@/lib/adminPagesScreen/pagesQuery'
import { SERVER_LIMIT, pageFilename } from '@/lib/adminPagesScreen/pageTerms'

const LIST_FALLBACK = 'לא הצלחנו לטעון את העמודים.'
const UPDATE_URL = '/api/admin/pages/update'

const toPages = (data) => (Array.isArray(data?.pages) ? data.pages.map((p) => ({ ...p, id: String(p.id), claimedById: p.claimedById == null ? null : String(p.claimedById) })) : [])

/**
 * כל העמודים לסינון של השרת: הבקשה הראשונה (כמו קודם), ואם בשרת יש יותר — ההמשך, בקשה אחרי בקשה, עד התקרה.
 * @param {{ status?: string, book?: string, user?: string }} query
 * @param {{ onProgress?: (progress: { loaded: number, total: number }) => void }} [options]
 * @returns {Promise<{ pages: any[], total: number, checked: number }>} total — כמה יש בשרת לסינון; checked — כמה
 *   מהם נבדקו (כל מה שנטען, או התקרה)
 */
export async function listPages(query, { onProgress } = {}) {
  const first = await requestJson(listUrl(query), { fallback: LIST_FALLBACK })
  const total = Number(first.pagination?.total) || 0
  const limit = Number(first.pagination?.limit) || SERVER_LIMIT
  const parts = [toPages(first)]
  const more = moreParts(total, limit)
  for (const part of more) {
    onProgress?.({ loaded: (part - 1) * limit, total })
    parts.push(toPages(await requestJson(listUrl(query, part), { fallback: LIST_FALLBACK })))
  }
  const pages = mergeParts(parts)
  return { pages, total: total || pages.length, checked: more.length > 0 ? Math.min(total, (more.length + 1) * limit) : Math.max(total, pages.length) }
}

/**
 * המצב העדכני של עמודים — לפני שליחה. ספר אחד (book) או כמה (books): לכל ספר בקשה משלו (ספר — עד כמה מאות
 * עמודים); מעל 8 ספרים — בקשה אחת לכל המצב (status), שזולה יותר מעשרות בקשות.
 * @param {{ books: string[], status?: string }} options status — רק עמודים במצב הזה ('' — כל המצבים)
 * @returns {Promise<Map<string, any>>} מזהה ← העמוד כמו שהוא עכשיו בשרת
 */
export async function loadCurrent({ books, status = '' }) {
  const names = [...new Set(books)]
  const lists = names.length > 8
    ? [(await listPages({ status })).pages]
    : await Promise.all(names.map(async (book) => (await listPages({ status, book })).pages))
  const out = new Map()
  for (const list of lists) for (const p of list) out.set(p.id, p)
  return out
}

/** @returns {Promise<{ books: string[], users: { id: string, name: string }[] }>} */
export async function loadFilterOptions() {
  const data = await requestJson('/api/admin/pages/filter-options', { fallback: 'לא הצלחנו לטעון את רשימות הספרים והמשתמשים.' })
  return { books: Array.isArray(data.books) ? data.books : [], users: Array.isArray(data.users) ? data.users : [] }
}

/**
 * עדכון עמוד. השרת מחזיר 404 כשאין ספר בשם הזה, ו-page: null כשאין בו עמוד במספר הזה — שניהם "לא נעשה דבר".
 * @param {any} page @param {object} updates @param {string} fallback
 */
async function updatePage(page, updates, fallback) {
  let data
  try {
    data = await requestJson(UPDATE_URL, { method: 'PUT', body: { bookName: page.bookName, pageNumber: page.number, updates }, fallback })
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) {
      throw new AdminApiError(`לא מצאנו ספר בשם "${page.bookName}". אולי שמו שונה או שהוא נמחק. רענן את הרשימה.`, 404)
    }
    throw error
  }
  if (!data.page) throw new AdminApiError('העמוד כבר לא קיים בספר (אולי נמחק). רענן את הרשימה.', 404)
  return data
}

const RELEASE_UPDATES = { status: 'available', claimedBy: null, claimedAt: null }

/** שחרור עמוד: חוזר להיות פנוי, בלי משתמש */
export function releasePage(page) {
  return updatePage(page, RELEASE_UPDATES, 'לא הצלחנו לשחרר את העמוד.')
}

/** שינוי המצב בלבד — אותו גוף כמו "ערוך סטטוס" במסך הקודם (updates: { status }) */
export function setPageStatus(page, status) {
  return updatePage(page, { status }, 'לא הצלחנו לשנות את המצב.')
}

/**
 * הדף נסגר (רענון, סגירת הלשונית) כשיש שחרורים שעוד ממתינים ל"בטל" — נשלחים מיד, בבקשה ששורדת את סגירת הדף
 * (keepalive, דרך requestJson — אותה כתובת, שיטה וגוף). בלי בדיקה לפני שליחה ובלי לחכות לתשובה — אין כבר דף שיציג אותה.
 */
export function releaseOnExit(pages) {
  for (const page of pages) {
    try {
      requestJson(UPDATE_URL, {
        method: 'PUT',
        keepalive: true,
        body: { bookName: page.bookName, pageNumber: page.number, updates: RELEASE_UPDATES },
        fallback: '',
      }).catch(() => {})
    } catch {
      // הדפדפן סירב (למשל יותר מדי בקשות keepalive) — אין מה לעשות כשהדף נסגר
    }
  }
}

/** הטקסט של עמוד אחד (כמו שהשרת מחזיר אותו — כולל שני טורים) */
export async function pageText(page) {
  try {
    const blob = await requestBlob(`/api/admin/pages/download/${encodeURIComponent(page.id)}`, { fallback: 'לא הצלחנו להוריד את הטקסט של העמוד.' })
    return await blob.text()
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) throw new AdminApiError('העמוד כבר לא קיים.', 404)
    throw error
  }
}

/**
 * הטקסט של כל העמודים של ספר, בקובץ אחד מהשרת (download-batch), באותו סינון של מצב ומשתמש.
 * @param {string} bookName @param {{ status?: string, user?: string }} query
 */
export async function bookText(bookName, query) {
  const blob = await requestBlob(batchDownloadUrl({ status: query.status || '', book: bookName, user: query.user || '' }), { fallback: 'לא הצלחנו להוריד את הטקסט של הספר.' })
  return blob.text()
}

/** הורדת הטקסט של עמוד אחד כקובץ */
export async function downloadPage(page) {
  const text = await pageText(page)
  saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), pageFilename(page))
}

/** הורדת כל העמודים בסינון של השרת — קישור הורדה, כמו "הכל" במסך הקודם */
export function downloadAllFiltered(query) {
  startDownload(batchDownloadUrl(query), 'all-pages.txt')
}
