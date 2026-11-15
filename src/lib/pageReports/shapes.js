// דיווחים על עמודים — צורות התשובה של ה-API ופענוח פרמטרי הרשימה (טהור: בלי DB/DOM, imports יחסיים —
// נבדק ב-node:test). הלוגיקה של הסימון עצמו — ב-rules.js.
import { REPORT_KINDS, ALL_STATUSES, ERROR_STATUSES, MESSAGE_STATUSES, findMarker, pageFieldForColumn, canApplyToPage,
  currentMarker, finalTexts, markerNeedsUpdate } from './rules.js'
import { normalizeCropRect } from './cropRect.js'

export const ADMIN_LIST_DEFAULT_LIMIT = 30
export const ADMIN_LIST_MAX_LIMIT = 100
export const MY_REPORTS_LIMIT = 50
/** מגבלת קצב: דיווחים למשתמש בשעה */
export const REPORTS_PER_HOUR = 30

const id = (v) => (v == null ? null : String(v))

/** כתובת צילום העמוד — כמו בעורך ובמסך העמודים (thumbnail: page.imagePath, בלי עיבוד) */
export function pageImageUrl(page) {
  return page?.imagePath || null
}

/** האם הסימון של דיווח טעות עדיין קיים בטקסט העמוד (בטור שלו) */
export function markerPresentIn(report, page) {
  if (report?.kind !== 'book_error' || !page) return false
  const text = page[pageFieldForColumn(report.column)] || ''
  const marker = currentMarker(report)
  return findMarker(text, marker.original, marker.proposed, report.offset ?? null) !== -1
}

/**
 * הנוסח שהמנהל קבע, כשהוא שונה מזה של המדווח (אחרת null). withEditor — גם מי קבע (רק בניהול).
 */
function finalShape(report, withEditor = true) {
  const edited = report?.kind === 'book_error' && (report.finalOriginal != null || report.finalProposed != null)
  const f = finalTexts(report)
  return {
    finalOriginal: edited ? f.original : null,
    finalProposed: edited ? f.proposed : null,
    ...(withEditor ? { finalByName: edited ? report.finalByName || '' : '' } : {}),
  }
}

/**
 * דיווח בצורת רשימת הניהול (וגם בתשובת ההכרעה).
 * @param {object} report מסמך PageReport (lean)
 * @param {object|null} page העמוד הנוכחי (status, imagePath והטקסט) — null אם נמחק
 */
export function adminReportShape(report, page) {
  const isError = report.kind === 'book_error'
  const pageStatus = page?.status || null
  const markerPresent = isError ? markerPresentIn(report, page) : false
  return {
    _id: id(report._id),
    kind: report.kind,
    bookPath: report.bookPath,
    bookName: report.bookName || '',
    pageNumber: report.pageNumber,
    userName: report.userName || '',
    column: report.column || 'content',
    original: report.original || '',
    proposed: report.proposed || '',
    contextBefore: report.contextBefore || '',
    contextAfter: report.contextAfter || '',
    cropRect: normalizeCropRect(report.cropRect),
    message: report.message || '',
    status: report.status,
    resolution: report.resolution
      ? { note: report.resolution.note || '', byName: report.resolution.byName || '', at: report.resolution.at || null }
      : null,
    appliedToText: report.appliedToText ?? null,
    appliedAt: report.appliedAt ?? null,
    ...finalShape(report),
    // אושר בנוסח של המנהל, והסימון שבטקסט עוד בנוסח הקודם (העמוד היה בעריכה) — "עדכן את הסימון בטקסט"
    markerStale: isError && report.status === 'approved' && !report.appliedToText && markerPresent && markerNeedsUpdate(report),
    createdAt: report.createdAt,
    pageStatus,
    imageUrl: pageImageUrl(page),
    markerPresent,
    canApply: isError && markerPresent && Boolean(page) && canApplyToPage(pageStatus) && !report.appliedToText,
  }
}

/** דיווח בצורת "הדיווחים שלי" (המתנדב — בלי שם המנהל) */
export function myReportShape(report) {
  return {
    _id: id(report._id),
    kind: report.kind,
    original: report.original || '',
    proposed: report.proposed || '',
    message: report.message || '',
    status: report.status,
    appliedToText: report.appliedToText ?? null,
    ...finalShape(report, false),
    resolution: report.resolution ? { note: report.resolution.note || '', at: report.resolution.at || null } : null,
    createdAt: report.createdAt,
  }
}

const intParam = (v, fallback) => {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isSafeInteger(n) ? n : NaN
}

/**
 * פרמטרי GET /api/admin/page-reports.
 * @param {URLSearchParams | Record<string, string>} params
 * @returns {{ ok: true, value: { kind, status, book, page, skip, limit } } | { ok: false, error: string }}
 */
export function parseAdminListQuery(params) {
  const get = (k) => (typeof params?.get === 'function' ? params.get(k) : params?.[k]) ?? null
  const kind = get('kind') || 'book_error'
  if (!REPORT_KINDS.includes(kind)) return { ok: false, error: 'סוג הדיווח אינו תקין' }
  const status = get('status') || 'pending'
  const allowed = kind === 'message' ? MESSAGE_STATUSES : ERROR_STATUSES
  if (status !== 'all' && !allowed.includes(status)) return { ok: false, error: 'הסטטוס אינו תקין' }
  const book = (get('book') || '').trim() || null
  const page = intParam(get('page'), null)
  if (page !== null && !(page >= 1)) return { ok: false, error: 'מספר העמוד אינו תקין' }
  const skip = intParam(get('skip'), 0)
  if (!(skip >= 0)) return { ok: false, error: 'פרמטר דילוג לא תקין' }
  const rawLimit = intParam(get('limit'), ADMIN_LIST_DEFAULT_LIMIT)
  if (!(rawLimit >= 1)) return { ok: false, error: 'פרמטר כמות לא תקין' }
  return { ok: true, value: { kind, status, book, page, skip, limit: Math.min(rawLimit, ADMIN_LIST_MAX_LIMIT) } }
}

/** ספירות ללשוניות מתוך שורות אגרגציה [{ _id: { kind, status }, count }] */
export function countsFromRows(rows) {
  const counts = {
    book_error: Object.fromEntries(ERROR_STATUSES.map((s) => [s, 0])),
    message: Object.fromEntries(MESSAGE_STATUSES.map((s) => [s, 0])),
  }
  for (const row of rows || []) {
    const { kind, status } = row?._id || {}
    if (counts[kind] && ALL_STATUSES.includes(status) && status in counts[kind]) counts[kind][status] = row.count || 0
  }
  return counts
}

/** במה משנים את טקסט העמוד לפי ההכרעה: אושר → התיקון, נדחה → המקור */
export function applyModeFor(status) {
  if (status === 'approved') return 'proposed'
  if (status === 'rejected') return 'original'
  return null
}
