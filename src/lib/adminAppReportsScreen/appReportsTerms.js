// "דיווחי תקלות" (/library/admin/app-reports) — שמות, מצב הכרטיס ב-GitHub, בקשת הרשימה, עימוד וקבצים מצורפים.
// לוגיקה טהורה (נבדק ב-appReportsScreen.test.mjs). הבקשות עצמן — כמו קודם (GET /api/app-reports/admin/list ו-/[reportId]).
import { errorMessage } from '../../components/admin/list/adminRequest.js'
import { formatNumber } from '../adminTerms.js'
import { fileSizeText } from '../adminList/fileSize.js'
import { PRODUCTS, productOf } from '../app-reports/products.js'

export const PAGE_SIZE = 50

export const PRODUCT_LABELS = Object.fromEntries(Object.values(PRODUCTS).map((p) => [p.key, p.displayName]))
export const TYPE_LABELS = { bug: 'תקלה', crash: 'קריסה', performance: 'ביצועים', suggestion: 'הצעה' }
/** איך הדיווח נשלח: המשתמש שלח בעצמו / אחרי קריסה (התוכנה הציעה, המשתמש אישר) / התוכנה שלחה לבד */
export const TRIGGER_LABELS = { manual: 'נשלח בידי המשתמש', crash_prompt: 'אחרי קריסה', auto_crash: 'נשלח אוטומטית' }
/** מצב הכרטיס ב-GitHub — ערכי הסינון (issueState) כמו קודם */
export const ISSUE_STATE_LABELS = { open: 'פתוח', closed: 'סגור', pending: 'ממתין לפתיחה' }
const CLOSE_REASON_LABELS = { completed: 'טופל', not_planned: 'לא יטופל', duplicate: 'כפול' }

/**
 * קבצים שהמדווח צירף לתשובה במייל ולא נשמרו באתר (רק תמונות נשמרות): "קובץ מצורף אחד לא נשמר באתר".
 * withImages — יש גם תמונות שנשמרו (מוצגות מתחת), ולכן "נוסף / נוספים".
 */
export function unsavedAttachmentsText(count, withImages = false) {
  const n = Math.max(0, Number(count) || 0)
  if (!n) return ''
  if (n === 1) return `קובץ מצורף אחד${withImages ? ' נוסף' : ''} לא נשמר באתר`
  return `${formatNumber(n)} קבצים מצורפים${withImages ? ' נוספים' : ''} לא נשמרו באתר`
}

export const EMPTY_FILTERS = Object.freeze({ product: '', type: '', trigger: '', issueState: '' })

/** אפשרויות לבורר מתוך מילון תוויות */
export const optionsOf = (labels) => Object.entries(labels).map(([value, label]) => ({ value, label }))

export const productLabel = (report) => {
  const product = productOf(report)
  return PRODUCT_LABELS[product] || product
}
export const typeLabel = (report) => TYPE_LABELS[report?.type] || report?.type || ''

/** דיווח איטיות שלא נשלח ידנית — "אחרי תקיעה", לא "אחרי קריסה" */
export function triggerLabel(report) {
  if (report?.trigger === 'crash_prompt' && report?.type === 'performance') return 'אחרי תקיעה'
  return TRIGGER_LABELS[report?.trigger] || report?.trigger || ''
}

/**
 * הכרטיס ב-GitHub: ממתין לפתיחה (pending, עוד בלי מספר) / פתוח / סגור (עם הסיבה) / בלי כרטיס (null).
 * @returns {{ state: 'pending'|'open'|'closed', label: string, tone: 'warning'|'success'|'neutral', number?: number, url?: string } | null}
 */
export function issueBadge(report) {
  if (!report) return null
  if (report.issuePending && !report.issueNumber) return { state: 'pending', label: 'ממתין לפתיחה', tone: 'warning' }
  if (!report.issueNumber) return null
  if (report.issueState === 'closed') {
    const reason = CLOSE_REASON_LABELS[report.issueStateReason]
    return { state: 'closed', label: reason ? `סגור (${reason})` : 'סגור', tone: 'neutral', number: report.issueNumber, url: report.issueUrl }
  }
  return { state: 'open', label: 'פתוח', tone: 'success', number: report.issueNumber, url: report.issueUrl }
}

/** פרמטרי הרשימה — אותו סדר ואותם שמות כמו קודם: page, limit, ואז המסננים שנבחרו */
export function listQuery(filters, page, limit = PAGE_SIZE) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  for (const [k, v] of Object.entries(filters || {})) if (v) params.set(k, v)
  return params.toString()
}

/** העימוד בצורה של ListPager */
export function pageInfo(total, page, size = PAGE_SIZE) {
  const t = Math.max(0, Number(total) || 0)
  const pageCount = Math.max(1, Math.ceil(t / size))
  const p = Math.min(Math.max(1, page), pageCount)
  return { page: p, pageCount, from: t === 0 ? 0 : (p - 1) * size + 1, to: Math.min(t, p * size), total: t }
}

export const reportsCountText = (n) => (n === 1 ? 'דיווח אחד' : `${formatNumber(n)} דיווחים`)

export const hasActiveFilters = (filters) => Object.values(filters || {}).some(Boolean)

/** גודל קובץ מצורף — בנוסח האחיד של הניהול (adminList/fileSize.js); בלי גודל — "0 B" */
export function formatBytes(size) {
  return fileSizeText(size || 0)
}

/** הקבצים להורדה בעמוד הדיווח: [{ kind, name, size, hint? }] — רק מה שצורף */
export function reportFiles(report) {
  const files = report?.files || {}
  const out = []
  if (files.diagnostics) out.push({ kind: 'diagnostics', name: 'diagnostics.json', size: files.diagnostics.size })
  if (files.errors) out.push({ kind: 'errors', name: 'errors.txt', size: files.errors.size })
  if (files.minidump) out.push({ kind: 'minidump', name: files.minidump.fileName || 'crash.dmp', size: files.minidump.size, hint: 'קובץ קריסה — נשמר באתר בלבד' })
  return out
}

/** "windows · 10.0 · x64" */
export const systemText = (report) => [report?.platform, report?.osVersion, report?.arch].filter(Boolean).join(' · ')

export const CONTACT_FAILED = 'לא הצלחנו לשלוח את ההודעה. נסה שוב.'

/**
 * שגיאת שליחת הודעה למדווח: 429 — יותר מדי פניות; 401 — ההתחברות פגה; 403 — אין הרשאה; הודעת שרת בעברית —
 * כמו שהיא; אחרת (למשל "Failed to contact reporter", או 'shabbat' בלי הסבר) — הודעה כללית. כמו errorMessage
 * של admin/list/adminRequest (נתיב יחסי: הקובץ נטען גם מ-node:test).
 */
export function contactErrorText(status, serverError) {
  if (status === 429) return 'נשלחו יותר מדי הודעות על הדיווח הזה. נסה שוב מאוחר יותר.'
  return errorMessage(status, CONTACT_FAILED, serverError)
}
