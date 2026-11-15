// "דיווחים על עמודים" (/library/admin/page-reports) — מצב המסך בכתובת, בניית הבקשות לשרת, ומה מותר בכל כרטיס.
// לוגיקה טהורה, בלי React ובלי DOM (נבדק ב-pageReportsQuery.test.mjs).
//
// ההכרעות משנות את הדיווח בלבד; עריכת העמוד מתבצעת ידנית.

export const REPORT_TABS = Object.freeze(['book_error', 'message'])
export const STATUS_FILTERS = Object.freeze({
  book_error: Object.freeze(['pending', 'approved', 'rejected', 'all']),
  message: Object.freeze(['pending', 'handled', 'all']),
})
/** גודל עמוד ברשימה — כמו ברירת המחדל של השרת */
export const PAGE_SIZE = 30
export const LIST_URL = '/api/admin/page-reports'

const DEFAULT_KIND = 'book_error'
const DEFAULT_STATUS = 'pending'

/** @typedef {{ kind: 'book_error' | 'message', status: string, book: string, page: number }} PageReportsQuery */

const str = (v) => (typeof v === 'string' ? v : '')

/**
 * המצב מהכתובת. ערך לא מוכר — ברירת המחדל (סוג: טעויות בספר; מצב: ממתין; עמוד: 1).
 * @param {URLSearchParams | null | undefined} params
 * @returns {PageReportsQuery}
 */
export function parsePageReportsQuery(params) {
  const get = (key) => str(params?.get?.(key) ?? '')
  const kind = REPORT_TABS.includes(get('kind')) ? get('kind') : DEFAULT_KIND
  const status = STATUS_FILTERS[kind].includes(get('status')) ? get('status') : DEFAULT_STATUS
  const page = Math.trunc(Number(get('page')))
  return { kind, status, book: get('book').trim(), page: Number.isSafeInteger(page) && page > 1 ? page : 1 }
}

/**
 * המצב לכתובת — רק מה שאינו ברירת מחדל, בסדר קבוע. "?a=1" או "".
 * @param {PageReportsQuery} query
 */
export function serializePageReportsQuery(query) {
  const params = new URLSearchParams()
  if (query.kind && query.kind !== DEFAULT_KIND) params.set('kind', query.kind)
  if (query.status && query.status !== DEFAULT_STATUS) params.set('status', query.status)
  if (query.book) params.set('book', query.book)
  if (query.page > 1) params.set('page', String(query.page))
  const s = params.toString()
  return s ? `?${s}` : ''
}

/**
 * שינוי במצב: כל שינוי (חוץ מעמוד) חוזר לעמוד הראשון. מעבר לשונית — המצב חוזר ל"ממתין" (למצבים יש שמות
 * אחרים בכל לשונית), והספר נשמר.
 * @param {PageReportsQuery} query
 * @param {Partial<PageReportsQuery>} patch
 * @returns {PageReportsQuery}
 */
export function updatePageReportsQuery(query, patch) {
  const next = { ...query, ...patch }
  if (patch.kind && patch.kind !== query.kind && !('status' in patch)) next.status = DEFAULT_STATUS
  if (!STATUS_FILTERS[next.kind]?.includes(next.status)) next.status = DEFAULT_STATUS
  if (!('page' in patch)) next.page = 1
  return next
}

/** כתובת הלשונית (קישור) — אותו ספר, מצב "ממתין", עמוד ראשון */
export function tabHref(pathname, query, kind) {
  return `${pathname}${serializePageReportsQuery({ kind, status: DEFAULT_STATUS, book: query.book, page: 1 })}`
}

/**
 * כתובת הבקשה לרשימה.
 * @param {PageReportsQuery} query
 */
export function listUrl(query) {
  const params = new URLSearchParams({ kind: query.kind, status: query.status })
  if (query.book) params.set('book', query.book)
  params.set('skip', String((Math.max(1, query.page) - 1) * PAGE_SIZE))
  params.set('limit', String(PAGE_SIZE))
  return `${LIST_URL}?${params}`
}

/** הכתובת של הכרעה על דיווח */
export const decideUrl = (id) => `${LIST_URL}/${encodeURIComponent(String(id))}`

/**
 * גוף ההכרעה. applyToText — רק באישור / דחייה, ורק כשסומן; note — רק כשיש.
 * @param {'approve' | 'reject' | 'reopen' | 'apply' | 'handled'} action
 * @param {{ applyToText?: boolean, note?: string }} [options]
 */
export function decisionBody(action, { note = '', edit = null } = {}) {
  const body = { action }
  if (action === 'approve' && edit) {
    body.original = edit.original
    body.proposed = edit.proposed
  }
  const trimmed = str(note).trim()
  if (trimmed && action !== 'reopen' && action !== 'apply') body.note = trimmed
  return body
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0)

/** המונים מהשרת, בצורה מלאה (מה שחסר — 0) */
export function normalizeCounts(raw) {
  return {
    book_error: { pending: num(raw?.book_error?.pending), approved: num(raw?.book_error?.approved), rejected: num(raw?.book_error?.rejected) },
    message: { pending: num(raw?.message?.pending), handled: num(raw?.message?.handled) },
  }
}

/** המונה של סוג ומצב; "הכול" — סכום המצבים של הסוג */
export function statusCount(counts, kind, status) {
  const forKind = counts?.[kind] || {}
  if (status === 'all') return Object.values(forKind).reduce((sum, n) => sum + num(n), 0)
  return num(forKind[status])
}

/** המונים אחרי שדיווח עבר ממצב למצב (בלי לחכות לשרת) */
export function countsAfter(counts, kind, from, to) {
  if (from === to || !counts?.[kind]) return counts
  const forKind = { ...counts[kind] }
  if (from in forKind) forKind[from] = Math.max(0, num(forKind[from]) - 1)
  if (to in forKind) forKind[to] = num(forKind[to]) + 1
  return { ...counts, [kind]: forKind }
}

/** האם הדיווח שייך לסינון המצב הנוכחי */
export const matchesStatus = (report, status) => status === 'all' || report?.status === status

/**
 * הרשימה אחרי הכרעה: הדיווח המעודכן במקומו — או יוצא, כשהמצב החדש כבר לא מתאים לסינון (אושר בסינון "ממתין").
 * @returns {{ items: any[], removed: boolean }}
 */
export function itemsAfterDecision(items, updated, status) {
  const id = String(updated?._id)
  if (!matchesStatus(updated, status)) return { items: items.filter((r) => String(r._id) !== id), removed: true }
  return { items: items.map((r) => (String(r._id) === id ? { ...r, ...updated } : r)), removed: false }
}

/**
 * העימוד (השרת מעמד): { page, pageCount, from, to, total } — לרכיב ListPager.
 * @param {number} page @param {number} total @param {number} shown כמה מוצגים בעמוד הזה
 */
export function serverPage(page, total, shown) {
  const t = num(total)
  const pageCount = Math.max(1, Math.ceil(t / PAGE_SIZE))
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount)
  const from = t === 0 || shown === 0 ? 0 : (current - 1) * PAGE_SIZE + 1
  return { page: current, pageCount, from, to: from === 0 ? 0 : from + shown - 1, total: t }
}

/** פעולות הכרעה זמינות רק לממתינים; הכרעה שלא הוחלה אפשר לפתוח מחדש. */
export function errorCardState(report) {
  const pending = report?.status === 'pending'
  const applied = Boolean(report?.appliedToText)
  return { pending, decide: pending, reopen: !pending && !applied, applied }
}

/** מה מוצג בכרטיס הודעה: "סמן כטופל" כשממתינה, "פתח מחדש" כשטופלה */
export function messageCardState(report) {
  return { handle: report?.status === 'pending', reopen: report?.status === 'handled' }
}

/** הקישור לעורך העמוד */
export function editorHref(bookPath, pageNumber) {
  return `/library/books/${encodeURIComponent(String(bookPath || ''))}/${encodeURIComponent(String(pageNumber ?? ''))}`
}

/**
 * הספרים לבורר: מה שכבר נראה (Map bookPath → שם) ועוד מה שבדיווחים שנטענו, ממוינים לפי שם. השרת לא מחזיר רשימת
 * ספרים — לכן הבורר מכיר את הספרים שהופיעו ברשימות שנטענו מאז שנכנסו למסך (ואת הספר שבכתובת).
 * @param {Map<string, string>} seen
 * @param {any[]} reports
 * @param {string} [current] הספר שבכתובת (גם אם עוד לא נטען דיווח שלו)
 * @returns {{ seen: Map<string, string>, options: { value: string, label: string }[] }}
 */
export function bookOptions(seen, reports, current = '') {
  const next = new Map(seen)
  for (const r of reports || []) {
    if (r?.bookPath && !next.has(r.bookPath)) next.set(r.bookPath, r.bookName || r.bookPath)
    else if (r?.bookPath && r.bookName && next.get(r.bookPath) === r.bookPath) next.set(r.bookPath, r.bookName)
  }
  if (current && !next.has(current)) next.set(current, current)
  const options = [...next].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'he'))
  return { seen: next, options }
}

/** מקשים בכרטיס שבו הפוקוס: J / K או ↑ ↓ — בין הכרטיסים; A — אשר; R — דחה */
export function cardKeyAction(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null
  if (event.key === 'ArrowDown' || event.code === 'KeyJ') return 'next'
  if (event.key === 'ArrowUp' || event.code === 'KeyK') return 'prev'
  if (event.code === 'KeyA') return 'approve'
  if (event.code === 'KeyR') return 'reject'
  return null
}

/**
 * ההקשר סביב הטעות, מקוצר מהצד הרחוק ממנה (…) — עד max תווים, ובגבול מילה כשאפשר.
 * @returns {{ before: string, after: string }}
 */
export function trimContext(contextBefore, contextAfter, max = 40) {
  const before = Array.from(String(contextBefore ?? ''))
  const after = Array.from(String(contextAfter ?? ''))
  let b = before.join('')
  if (before.length > max) {
    const cut = before.slice(-max).join('')
    const space = cut.indexOf(' ')
    b = `…${space >= 0 && space < cut.length - 1 ? cut.slice(space + 1) : cut}`
  }
  let a = after.join('')
  if (after.length > max) {
    const cut = after.slice(0, max).join('')
    const space = cut.lastIndexOf(' ')
    a = `${space > 0 ? cut.slice(0, space) : cut}…`
  }
  return { before: b, after: a }
}

/**
 * מה מסונן (לסרגל הסינון המשותף): מצב שאינו ברירת המחדל, וספר. statusLabel / bookLabel — השמות לתצוגה.
 * @returns {{ count: number, summary: string[], clearPatch: { status: string, book: string } }}
 */
export function activeFilters(query, statusLabel, bookLabel) {
  const summary = []
  if (query?.status && query.status !== DEFAULT_STATUS) summary.push(statusLabel || query.status)
  if (query?.book) summary.push(bookLabel || query.book)
  return { count: summary.length, summary, clearPatch: { status: DEFAULT_STATUS, book: '' } }
}

/**
 * הנוסח שהמנהל ערך לפני האישור: null — לא שינה (נשלח בלי נוסח, והשרת משאיר את של המדווח); אחרת — { original, proposed }.
 * @param {{ original?: string, proposed?: string }} report
 * @param {{ original: string, proposed: string } | null} draft
 */
export function decisionEdit(report, draft) {
  if (!draft) return null
  if (draft.original === (report?.original ?? '') && draft.proposed === (report?.proposed ?? '')) return null
  return { original: draft.original, proposed: draft.proposed }
}

/**
 * "הוצע: … · הוחלט: …" — כשהנוסח שהמנהל קבע שונה מזה של המדווח (אחרת null).
 * @returns {{ reported: string, decided: string } | null}
 */
export function finalVersionLine(report) {
  if (report?.finalProposed == null && report?.finalOriginal == null) return null
  const fo = report.finalOriginal ?? report.original ?? ''
  const fp = report.finalProposed ?? report.proposed ?? ''
  if (fo === report.original && fp === report.proposed) return null
  return { reported: `(${report.original ?? ''})[${report.proposed ?? ''}]`, decided: `(${fo})[${fp}]` }
}
