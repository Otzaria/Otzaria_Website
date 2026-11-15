// קריאות השרת של הדיווחים מעורך העמוד (POST / GET /api/page-reports). השגיאות בעברית —
// מהשרת, ואם אין — לפי קוד הסטטוס (reportErrorMessage).

import { reportErrorMessage } from './reportLogic'

async function readJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * שליחת דיווח. מחזיר את הדיווח שנוצר, או זורק Error עם הודעה בעברית.
 * @param {object} body
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ _id: string, kind: string, status: string, createdAt: string }>}
 */
export async function postPageReport(body, fetchImpl = fetch) {
  let res
  try {
    res = await fetchImpl('/api/page-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(reportErrorMessage(0, null))
  }
  const data = await readJson(res)
  if (!res.ok || !data?.success) throw new Error(reportErrorMessage(res.status, data))
  return data.report
}

/**
 * הדיווחים של המשתמש עצמו על העמוד (חדש → ישן).
 * @returns {Promise<Array<object>>}
 */
export async function fetchMyPageReports(bookPath, pageNumber, fetchImpl = fetch) {
  const qs = new URLSearchParams({ bookPath: String(bookPath), pageNumber: String(pageNumber) })
  let res
  try {
    res = await fetchImpl(`/api/page-reports?${qs}`, { cache: 'no-store' })
  } catch {
    throw new Error('טעינת הדיווחים נכשלה. בדקו את החיבור.')
  }
  const data = await readJson(res)
  if (!res.ok || !data?.success) throw new Error(data?.error || 'טעינת הדיווחים נכשלה.')
  return Array.isArray(data.reports) ? data.reports : []
}
