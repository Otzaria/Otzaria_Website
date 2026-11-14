// הבקשות של מסכי "אימון מודלים" (עמודים לאימון, תמלול שורות, תיוג מבנה) — לנקודות הקצה הקיימות, באותה שיטה
// ובאותו גוף כמו המסכים הקודמים (בלי שינוי בשרת). דרך adminRequest: התחברות שפגה / אין הרשאה / שרת שלא עונה —
// שגיאה בעברית.
import { AdminApiError, errorMessage, requestJson, send } from '@/components/admin/list/adminRequest'
import { layoutUrl } from '@/lib/adminTrainingScreen/ocrLayoutQuery'
import { linesUrl } from '@/lib/adminTrainingScreen/ocrLinesQuery'

// ----- עמודים לאימון -----
export async function loadTrainingPages() {
  const data = await requestJson('/api/admin/ocr-training', { fallback: 'לא הצלחנו לטעון את העמודים לאימון.', cache: 'no-store' })
  return Array.isArray(data.pages) ? data.pages : []
}
export async function loadTrainingBooks() {
  const data = await requestJson('/api/admin/ocr-training/books', { fallback: 'לא הצלחנו לטעון את רשימת הספרים.' })
  return Array.isArray(data.books) ? data.books : []
}
/** @param {{ bookId: string, pageNumber: number, scriptType: string }} body */
export function addTrainingPage(body) {
  return requestJson('/api/admin/ocr-training', { method: 'POST', body, fallback: 'לא הצלחנו להוסיף את העמוד.' })
}
export function deleteTrainingPage(id) {
  return requestJson(`/api/admin/ocr-training/${id}`, { method: 'DELETE', fallback: 'לא הצלחנו למחוק את העמוד.' })
}
export function releaseTrainingPage(id) {
  return requestJson(`/api/admin/ocr-training/${id}`, { method: 'PATCH', body: { action: 'release' }, fallback: 'לא הצלחנו לשחרר את העמוד.' })
}
/** הורדת השורות המסומנות (ZIP); status — 'completed' לעמודים שהושלמו בלבד, '' — הכול */
export function trainingExportHref(status = '') {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  return `/api/admin/ocr-training/export?${params.toString()}`
}
/** קישור לעמוד העבודה של המתנדבים (סימון השורות) */
export const trainingPageHref = (id) => `/library/ocr-training/${id}`

// ----- תמלול שורות -----
export function loadLines(query, skip = 0) {
  return requestJson(linesUrl(query, skip), { fallback: 'לא הצלחנו לטעון את השורות.', cache: 'no-store' })
}
/** @param {string} id @param {Record<string, any>} body  { action, ... } — כמו קודם */
export function patchLine(id, body, fallback) {
  return requestJson(`/api/admin/ocr-lines/${id}`, { method: 'PATCH', body, fallback })
}
export function deleteLine(id) {
  return requestJson(`/api/admin/ocr-lines/${id}`, { method: 'DELETE', fallback: 'לא הצלחנו למחוק את השורה.' })
}
export const LINES_EXPORT_HREF = '/api/admin/ocr-lines/export'
export const lineImageSrc = (id) => `/api/ocr-lines/${id}/image`

// ----- תיוג מבנה -----
export function loadLayout(query, skip = 0) {
  return requestJson(layoutUrl(query, skip), { fallback: 'לא הצלחנו לטעון את עמודי התיוג.', cache: 'no-store' })
}
export function patchLayout(id, body, fallback) {
  return requestJson(`/api/admin/ocr-layout/${id}`, { method: 'PATCH', body, fallback })
}
export function deleteLayout(id) {
  return requestJson(`/api/admin/ocr-layout/${id}`, { method: 'DELETE', fallback: 'לא הצלחנו למחוק את העמוד.' })
}
export const LAYOUT_EXPORT_HREF = '/api/admin/ocr-layout/export'
export const layoutThumbSrc = (id) => `/api/ocr-layout/${id}/image?thumb=1`

/** ייבוא קובץ ZIP מפרויקט ה-OCR — FormData עם file, כמו קודם. ייבוא גדול — תקרת זמן ארוכה */
export async function importLayoutBatch(file) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await send('/api/admin/ocr-layout/import', { method: 'POST', body: fd, timeoutMs: 5 * 60 * 1000 })
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok || !data?.success) throw new AdminApiError(errorMessage(res.status, 'הייבוא נכשל.', data?.error), res.status)
  return data
}
