// הסינון והמיון במסך ניהול העמודים.

import { paginate as paginateList } from '../adminList/paginate.js'
import { PAGE_STATUSES, STALE_DAYS, STALE_HINTS, STALE_LABEL, STATUS_LABELS, isStale } from './pageTerms.js'

export const PAGES_PER_PAGE = 50
export const PAGE_SORTS = ['book', 'oldest', 'newest']
export const SORT_LABELS = { book: 'לפי ספר ועמוד', oldest: 'הוותיקים קודם', newest: 'עודכן לאחרונה קודם' }
const DEFAULT_SORT = 'book'
const PARAM_ORDER = ['status', 'book', 'user', 'stale', 'sort', 'page']

/** @typedef {{ status: string, book: string, user: string, stale: number, sort: string, page: number }} PagesQuery */

function reader(params) {
  return (name) => {
    if (!params) return ''
    const value = typeof params.get === 'function' ? params.get(name) : params[name]
    return String((Array.isArray(value) ? value[0] : value) ?? '').trim()
  }
}

/** מזהה משתמש במסד (ObjectId: 24 תווים הקסדצימליים) — כל דבר אחר היה מחזיר מהשרת שגיאה (500) */
export function isUserId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value ?? ''))
}

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params
 * @returns {PagesQuery}
 */
export function parsePagesQuery(params) {
  const get = reader(params)
  const stale = Number(get('stale'))
  const sort = get('sort')
  const page = Number.parseInt(get('page'), 10)
  const staleDays = STALE_DAYS.includes(stale) ? stale : 0
  const status = get('status')
  return {
    status: staleDays ? 'in-progress' : PAGE_STATUSES.includes(status) ? status : '',
    book: get('book').slice(0, 300),
    user: isUserId(get('user')) ? get('user') : '',
    stale: staleDays,
    sort: PAGE_SORTS.includes(sort) ? sort : DEFAULT_SORT,
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
  }
}

/** הכתובת של שאילתה — בלי ערכי ברירת מחדל ובסדר קבוע; "" כשאין כלום */
export function serializePagesQuery(query) {
  const params = new URLSearchParams()
  for (const name of PARAM_ORDER) {
    const value = query?.[name]
    if (value === undefined || value === null || value === '' || value === 0) continue
    if (name === 'sort' && value === DEFAULT_SORT) continue
    if (name === 'page' && Number(value) <= 1) continue
    // "בעבודה יותר מ-" כבר אומר "בעבודה"
    if (name === 'status' && query.stale) continue
    params.set(name, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * שינוי בסינון / במיון — חוזרים לעמוד הראשון (חוץ משינוי העמוד עצמו). "בלי שינוי יותר מ-" בוחר מצב "בעבודה",
 * ומחליף את המיון ל"הוותיקים קודם" (אם המיון עוד ברירת המחדל — מיון שנבחר ביד נשאר); מעבר למצב אחר מבטל אותו.
 * @param {PagesQuery} query @param {Partial<PagesQuery>} patch
 */
export function updatePagesQuery(query, patch) {
  const next = { ...query, ...patch, page: 'page' in patch ? (patch.page ?? query.page) : 1 }
  if (patch.stale) {
    next.status = 'in-progress'
    if (!query.stale && !('sort' in patch) && query.sort === DEFAULT_SORT) next.sort = 'oldest'
  } else if ('status' in patch && patch.status !== 'in-progress') next.stale = 0
  return next
}

/** כמה מסננים פעילים — "בלי שינוי יותר מ-" נספר אחד (המצב "בעבודה" שנבחר איתו — לא נספר בנפרד) */
export function activeFilterCount(query) {
  return [query.stale ? '' : query.status, query.book, query.user, query.stale].filter(Boolean).length
}

export function clearFilters(query) {
  return { ...query, status: '', book: '', user: '', stale: 0, page: 1 }
}

/** "הורד את כל המסוננים" — כמו "הכל" במסך הקודם (api/admin/pages/download-batch) */
export function batchDownloadUrl(query) {
  return `/api/admin/pages/download-batch?${serverParams(query)}`
}

function serverParams(query) {
  const params = new URLSearchParams()
  if (query.status) params.append('status', query.status)
  if (query.book) params.append('book', query.book)
  if (query.user) params.append('userId', query.user)
  return params.toString()
}

const time = (value) => {
  const ms = new Date(value ?? NaN).getTime()
  return Number.isFinite(ms) ? ms : 0
}

const byBook = (a, b) => String(a.bookName || '').localeCompare(String(b.bookName || ''), 'he') || (Number(a.number) || 0) - (Number(b.number) || 0)

const COMPARE = {
  book: byBook,
  oldest: (a, b) => time(a.updatedAt) - time(b.updatedAt) || byBook(a, b),
  newest: (a, b) => time(b.updatedAt) - time(a.updatedAt) || byBook(a, b),
}

/**
 * העמודים שמוצגים, בסדר המיון. "בלי שינוי יותר מ-" — לפי "עודכן". keep — עמודים ששונו במסך (שוחררו, או שהבדיקה
 * לפני שליחה מצאה שהשתנו): נשארים במקומם גם אם כבר לא מתאימים לסינון — כדי ששורה לא תיעלם ושהשורות שמתחתיה לא
 * יעלו מתחת לסמן. יוצאים ברענון / בשינוי סינון.
 * @param {any[]} pages @param {PagesQuery} query @param {number} [now] @param {Set<string>} [keep]
 */
export function filterPages(pages, query, now = Date.now(), keep) {
  const out = (pages || []).filter((p) => {
    if (keep?.has(p.id)) return true
    if (query.status && p.status !== query.status) return false
    if (query.stale && !isStale(p, query.stale, now)) return false
    return true
  })
  return out.sort(COMPARE[query.sort] || COMPARE[DEFAULT_SORT])
}

export function paginate(items, page, size = PAGES_PER_PAGE) {
  return paginateList(items, page, size)
}

/**
 * "קפוץ לעמוד 287": באיזה עמוד של הרשימה הוא, ואיזו שורה. null — אין עמוד במספר הזה ברשימה (בסינון הזה).
 * @param {{ id: string, number: number }[]} items הרשימה המוצגת, בסדר המיון @param {number} number
 */
export function jumpTarget(items, number, size = PAGES_PER_PAGE) {
  const index = (items || []).findIndex((p) => Number(p.number) === Number(number))
  if (index < 0) return null
  return { page: Math.floor(index / size) + 1, id: items[index].id }
}

/** אפשרויות הבוררים. השרת מחזיר ספרים (שמות) ומשתמשים ({ id, name }) — api/admin/pages/filter-options */
export function filterOptions({ books = [], users = [] } = {}) {
  return {
    statuses: PAGE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
    books: books.map((name) => ({ value: name, label: name })),
    users: users.map((u) => ({ value: u.id, label: u.name || '(בלי שם)' })),
    stale: STALE_DAYS.map((d) => ({ value: String(d), label: `${d} ימים`, description: STALE_HINTS[d] })),
  }
}

/** מה מסונן, במילים: "בלי שינוי יותר מ-14 ימים · מסילת ישרים" ("בלי שינוי יותר מ-" כבר אומר "בעבודה") */
export function filterSummary(query, options) {
  const parts = []
  if (query.stale) parts.push(`${STALE_LABEL}${query.stale} ימים`)
  else if (query.status) parts.push(STATUS_LABELS[query.status])
  if (query.book) parts.push(query.book)
  if (query.user) parts.push(options?.users?.find((u) => u.value === query.user)?.label || 'משתמש')
  return parts
}
