// הקריאות של מסך ההעלאות לשרת — עטיפה דקה מעל fetch לנקודות הקצה הקיימות (בלי שינוי בהן).
// כל פעולה על כמה העלאות עוברת דרך נקודות הקצה המרובות (batch-*), שמקבלות גם העלאה אחת — מסלול
// אחד לכל פעולה. כשל נזרק כ-UploadsApiError עם הודעה בעברית.
//
// ההתנהגות המשותפת (הפניה = התחברות שפגה, תשובה שאינה JSON = שגיאה, תקרת זמן, הודעות) — ברכיב המשותף
// admin/list/adminRequest.js, ולא בעותק כאן: תיקון שם מגיע לשני המסכים.
import {
  AdminApiError,
  errorMessage,
  requestJson,
  saveBlob,
  send,
  startDownload,
} from '@/components/admin/list/adminRequest'

/** אותה שגיאה כמו ב-adminRequest (status, sessionExpired) — בשם של המסך, למי שבודק instanceof */
export class UploadsApiError extends AdminApiError {
  constructor(message, status, options) {
    super(message, status, options)
    this.name = 'UploadsApiError'
  }
}

/** כל כשל — כ-UploadsApiError (אותה הודעה, אותו status) */
async function asUploadsError(promise) {
  try {
    return await promise
  } catch (e) {
    if (e instanceof AdminApiError && !(e instanceof UploadsApiError)) {
      throw new UploadsApiError(e.message, e.status, { sessionExpired: e.sessionExpired, code: e.code })
    }
    throw e
  }
}

function request(url, options) {
  return asUploadsError(requestJson(url, options))
}

export async function fetchUploads() {
  const data = await request('/api/admin/uploads/list', { fallback: 'השרת לא החזיר את הרשימה. נסה שוב בעוד רגע.' })
  return Array.isArray(data.uploads) ? data.uploads : []
}

export async function fetchTrash() {
  const data = await request('/api/admin/uploads/trash', { fallback: 'השרת לא החזיר את הרשימה. נסה שוב בעוד רגע.' })
  // באשפה המזהה מגיע כ-ObjectId מסורלז — מחרוזת בכל מקרה
  return (Array.isArray(data.uploads) ? data.uploads : []).map((u) => ({ ...u, id: String(u.id) }))
}

export async function fetchBookStatuses() {
  const data = await request('/api/admin/book-statuses', { fallback: 'לא הצלחנו לטעון את המצבים.' })
  return data.statuses || null
}

export function saveBookStatuses(statuses) {
  return request('/api/admin/book-statuses', { method: 'POST', body: { statuses }, fallback: 'לא הצלחנו לשמור את הגדרות המצבים.' })
}

export function moveToTrash(uploadIds) {
  return request('/api/admin/uploads/batch-move-to-trash', { method: 'PUT', body: { uploadIds }, fallback: 'לא הצלחנו להעביר לאשפה.' })
}

export function restoreFromTrash(uploadIds) {
  return request('/api/admin/uploads/batch-restore', { method: 'PUT', body: { uploadIds }, fallback: 'לא הצלחנו לשחזר. ההעלאה עדיין באשפה.' })
}

export function deleteForever(uploadIds) {
  return request('/api/admin/uploads/batch-permanent-delete', { method: 'DELETE', body: { uploadIds }, fallback: 'לא הצלחנו למחוק לצמיתות.' })
}

export function emptyTrash() {
  return request('/api/admin/uploads/empty-trash', { method: 'DELETE', fallback: 'לא הצלחנו לרוקן את האשפה.' })
}

export function setBookStatus(uploadIds, bookStatus) {
  return request('/api/admin/uploads/batch-update-book-status', { method: 'PUT', body: { uploadIds, bookStatus }, fallback: 'לא הצלחנו לשנות את המצב.' })
}

export async function createEditCopy(uploadIds, bookName) {
  const data = await request('/api/admin/uploads/create-edit-copy', { method: 'POST', body: { uploadIds, bookName }, fallback: 'לא הצלחנו ליצור עותק עריכה.' })
  return data.editCopyId
}

/** הורדת קובץ אחד — קישור ישיר (הדפדפן מוריד; בלי לטעון את הקובץ לזיכרון הדף) */
export function downloadUpload(upload) {
  startDownload(`/api/download/${encodeURIComponent(upload.id)}`, upload.originalFileName || 'download.txt')
}

/** הורדת כמה העלאות כקובץ טקסט אחד (/api/download/batch — למנהל כללי בלבד) */
export async function downloadCombined(uploadIds, filename) {
  const res = await asUploadsError(send('/api/download/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadIds }),
  }))
  if (!res.ok) throw new UploadsApiError(errorMessage(res.status, 'לא הצלחנו להוריד את הקבצים.'), res.status)
  // דף HTML במקום הקובץ (הפניה שלא זוהתה) — לא שומרים אותו כקובץ
  if ((res.headers?.get?.('content-type') || '').includes('text/html')) throw new UploadsApiError('לא הצלחנו להוריד את הקבצים.', res.status)
  saveBlob(await res.blob(), filename)
}
