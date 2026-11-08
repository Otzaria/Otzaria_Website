// הקריאות של מסך הספרים לשרת — לנקודות הקצה הקיימות, בלי שינוי בהן (נתיבים, קלט ותשובות).
// כשל נזרק כ-AdminApiError עם הודעה בעברית; התחברות שפגה מזוהה גם כשה-proxy מפנה לדף ההתחברות.
import { normalizeBook } from '@/lib/adminBooks/bookTerms'
import { AdminApiError, SESSION_EXPIRED_MESSAGE, errorMessage, requestBlob, requestJson, saveBlob } from '@/components/admin/list/adminRequest'

/** כל הספרים — אותו נתון כמו בעמוד (Server Component), לרענון אחרי פעולה */
export async function fetchBooks() {
  const data = await requestJson('/api/library/list', { fallback: 'השרת לא החזיר את רשימת הספרים. נסה שוב בעוד רגע.' })
  return (Array.isArray(data.books) ? data.books : []).map(normalizeBook)
}

/** הקטגוריות ({ name, color }) */
export async function fetchCategories() {
  const data = await requestJson('/api/admin/categories', { fallback: 'לא הצלחנו לטעון את הקטגוריות.' })
  return (Array.isArray(data.categories) ? data.categories : []).map((c) => ({ name: String(c?.name ?? ''), color: c?.color }))
}

/** שמירת כל רשימת הקטגוריות (השרת מחליף את הרשימה כולה) */
export function saveCategories(categories) {
  return requestJson('/api/admin/categories', { method: 'POST', body: { categories }, fallback: 'לא הצלחנו לשמור את הקטגוריות.' })
}

/**
 * עדכון ספר: שם, קטגוריה, הסתרה / הצגה (ועם הצגה — האם לשלוח הודעה למנויים).
 * @param {string} bookId
 * @param {{ name?: string, category?: string, isHidden?: boolean, sendNotification?: boolean }} patch
 */
export function updateBook(bookId, patch, fallback = 'לא הצלחנו לעדכן את הספר.') {
  return requestJson('/api/admin/books/update', { method: 'PUT', body: { bookId, ...patch }, fallback })
}

export function deleteBook(bookId) {
  return requestJson('/api/admin/books/delete', { method: 'DELETE', body: { bookId }, fallback: 'לא הצלחנו למחוק את הספר.' })
}

/** מיזוג (לפי הסדר): נוצר ספר חדש, והמקוריים נמחקים. עשוי לקחת זמן — תקרת זמן ארוכה */
export function mergeBooks({ bookIds, newName, isHidden }) {
  return requestJson('/api/admin/books/merge', {
    method: 'POST',
    body: { bookIds, newName, isHidden },
    fallback: 'לא הצלחנו למזג את הספרים.',
    timeoutMs: 10 * 60 * 1000,
  })
}

/** הספר והעמודים שלו (מצב, מי עובד, ועמוד דוגמה) — לפי ה-slug */
export async function fetchBookDetails(path) {
  const data = await requestJson(`/api/book/${encodeURIComponent(path)}`, { fallback: 'לא הצלחנו לטעון את העמודים של הספר.' })
  return { book: data.book || {}, pages: Array.isArray(data.pages) ? data.pages : [] }
}

/** הנחיות העריכה של ספר ועמוד הדוגמה */
export function saveBookInstructions(bookId, { editingInfo, examplePage }) {
  return requestJson('/api/book/update-info', { method: 'POST', body: { bookId, editingInfo, examplePage }, fallback: 'לא הצלחנו לשמור את ההנחיות.' })
}

export function saveGlobalInstructions(instructions) {
  return requestJson('/api/admin/books/global-instructions', { method: 'POST', body: { instructions }, fallback: 'לא הצלחנו לשמור את ההנחיות הכלליות.' })
}

export function deleteSubscriber(email) {
  return requestJson('/api/admin/mailing-list/delete', { method: 'DELETE', body: { email }, fallback: 'לא הצלחנו להסיר את המנוי.' })
}

/** הורדת הטקסט של הספר (מה שכבר נערך) כקובץ אחד */
export async function downloadBookText(book, filename) {
  const data = await requestJson(`/api/admin/books/export-text?bookId=${encodeURIComponent(book.id)}`, { fallback: 'לא הצלחנו להכין את קובץ הטקסט.', timeoutMs: 5 * 60 * 1000 })
  saveBlob(new Blob([data.combinedText ?? ''], { type: 'text/plain;charset=utf-8' }), filename)
}

/** הורדת הספר כ-PDF (מתמונות העמודים) */
export async function downloadBookPdf(book, filename) {
  const blob = await requestBlob(`/api/admin/books/export-pdf?bookId=${encodeURIComponent(book.id)}`, { fallback: 'לא הצלחנו להכין את ה-PDF.', timeoutMs: 10 * 60 * 1000 })
  saveBlob(blob, filename)
}

/**
 * העלאת ספר חדש (PDF) — XMLHttpRequest ולא fetch, בשביל התקדמות ההעלאה (קבצים עד 50MB). אחרי ההעלאה
 * השרת ממיר את הקובץ לעמודים, וזה יכול לקחת זמן — onProgress(1) ואז המתנה לתשובה (עד 15 דקות, ואז
 * שגיאה — כדי שהחלון לא יישאר על "מחלק לעמודים…" לנצח).
 * @param {FormData} formData
 * @param {{ onProgress?: (fraction: number) => void }} [options]
 */
export function uploadBook(formData, { onProgress } = {}) {
  const fallback = 'לא הצלחנו להוסיף את הספר. נסה שוב.'
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/admin/books/upload')
    xhr.responseType = 'text'
    xhr.timeout = 15 * 60 * 1000
    xhr.ontimeout = () => reject(new AdminApiError('השרת לא סיים לעבד את הקובץ בזמן. בדוק ברשימה אם הספר נוסף, ונסה שוב.', 408))
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total)
    }
    xhr.upload.onload = () => onProgress?.(1)
    xhr.onerror = () => reject(new AdminApiError('אין חיבור לשרת. בדוק את החיבור ונסה שוב.', 0))
    xhr.onload = () => {
      // XHR עוקב אחרי הפניות בעצמו: הגענו לדף ההתחברות — ההתחברות פגה
      if (xhr.status === 401 || /\/auth\/login/.test(xhr.responseURL || '')) {
        reject(new AdminApiError(SESSION_EXPIRED_MESSAGE, 401, { sessionExpired: true }))
        return
      }
      let data = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = null
      }
      if (xhr.status < 200 || xhr.status >= 300 || !data || data.success === false) {
        reject(new AdminApiError(errorMessage(xhr.status, fallback, data?.error), xhr.status))
        return
      }
      resolve(data)
    }
    xhr.send(formData)
  })
}
