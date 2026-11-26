// הבקשות של "דיווחים על עמודים" לשרת (לפי החוזה של הפיצ'ר):
//   GET   /api/admin/page-reports?kind=&status=&book=&skip=&limit=   → { reports, counts, books, total, hasMore }
//   PATCH /api/admin/page-reports/[id]  { action, note?, original?, proposed? } → { report }
// העטיפה (adminRequest) מוסיפה: התחברות שפגה מזוהה, תקרת זמן, והודעת השרת בעברית (למשל 409 — "העמוד בעריכה").
import { requestJson } from '@/components/admin/list/adminRequest'
import { decideUrl, listUrl, normalizeCounts } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { failText } from '@/lib/adminPageReportsScreen/pageReportsTerms'

/**
 * @param {import('@/lib/adminPageReportsScreen/pageReportsQuery').PageReportsQuery} query
 * @returns {Promise<{ reports: any[], counts: ReturnType<typeof normalizeCounts>, books: { bookPath: string, bookName: string }[], total: number, hasMore: boolean }>}
 */
export async function loadPageReports(query) {
  const data = await requestJson(listUrl(query), { fallback: 'לא הצלחנו לטעון את הדיווחים.', cache: 'no-store' })
  const reports = Array.isArray(data.reports) ? data.reports : []
  return {
    reports,
    counts: normalizeCounts(data.counts),
    books: Array.isArray(data.books) ? data.books : [],
    total: Number.isFinite(Number(data.total)) ? Number(data.total) : reports.length,
    hasMore: data.hasMore === true,
  }
}

/**
 * הכרעה על דיווח.
 * @param {string} id
 * @param {{ action: string, note?: string }} body
 * @returns {Promise<{ report: any }>}
 */
export async function decidePageReport(id, body) {
  const data = await requestJson(decideUrl(id), { method: 'PATCH', body, fallback: failText(body.action) })
  return { report: data.report || null }
}
