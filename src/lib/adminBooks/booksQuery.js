// הסינון, המיון, העימוד והמגירה של מסך הספרים — לוגיקה טהורה. הכול נשמר בכתובת, כדי שקישור (למשל
// מהלוח: ?status=hidden) יפתח את המסך מסונן, שקישור לספר (?book=…) יפתח את המגירה שלו, ושחזרה
// אחורה תחזיר לאותו מקום.
//
// פרמטרים: q (חיפוש בשם הספר ובשם הבעלים) · status (not_started / in_progress / completed) ·
// vis (hidden / visible — נראות, בנפרד מההתקדמות: "בעבודה וגלוי") ·
// owner (public / personal) · cat (קטגוריות, כמה) · sort (updated / name / progress) · page (מ-1) ·
// book (מזהה הספר שהמגירה שלו פתוחה) · view (הלשונית במגירה).
// ערך ברירת מחדל לא נכתב בכתובת; ערך לא מוכר נזרק — status / owner / sort / view / page כבר בקריאה,
// וקטגוריה או ספר שלא קיימים — ב-sanitizeBooksQuery, כשהנתונים ידועים. כך הכתובת אומרת מה מוצג באמת.
// קישור ישן ?status=hidden (לפני ש"מוסתר" עבר לבורר משלו) — נקרא כ-vis=hidden.
import { normalizeHebrew } from '../hebrewSearchNormalize.js'
import { paginate as paginateList } from '../adminList/paginate.js'
import { bookOwnership, bookProgress, displayCategory, safeColor } from './bookTerms.js'

export const BOOK_STATUS_FILTERS = ['not_started', 'in_progress', 'completed']
export const BOOK_VISIBILITY_FILTERS = ['hidden', 'visible']
export const BOOK_OWNER_FILTERS = ['public', 'personal']
export const BOOK_SORTS = ['updated', 'name', 'progress']
/** הלשוניות של מגירת הספר. הראשונה — ברירת המחדל (לא נכתבת בכתובת) */
export const DRAWER_VIEWS = ['details', 'pages', 'instructions', 'ocr', 'training']
/** כמה ספרים בכל עמוד */
export const BOOKS_PER_PAGE = 50
const MAX_VALUES = 50
const MAX_VALUE_LENGTH = 200

export const STATUS_FILTER_LABELS = Object.freeze({ not_started: 'לא התחילו', in_progress: 'בעבודה', completed: 'הושלם' })
export const VISIBILITY_FILTER_LABELS = Object.freeze({ hidden: 'מוסתר', visible: 'מוצג לכולם' })
export const OWNER_FILTER_LABELS = Object.freeze({ public: 'ציבורי', personal: 'אישי' })
export const SORT_LABELS = Object.freeze({ updated: 'עודכנו לאחרונה', name: 'לפי שם', progress: 'הכי פחות התקדמו' })

export const DEFAULT_BOOKS_QUERY = Object.freeze({
  q: '', status: '', vis: '', owner: '', cat: Object.freeze([]), sort: 'updated', page: 1, book: '', view: 'details',
})

const PARAM_ORDER = ['q', 'status', 'vis', 'owner', 'cat', 'sort', 'page', 'book', 'view']

/** @typedef {{ q: string, status: string, vis: string, owner: string, cat: string[], sort: string, page: number, book: string, view: string }} BooksQuery */

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params
 * @returns {BooksQuery}
 */
export function parseBooksQuery(params) {
  const all = (name) => {
    if (!params) return []
    const value = typeof params.getAll === 'function' ? params.getAll(name) : params[name]
    return (Array.isArray(value) ? value : [value]).filter((v) => v !== undefined && v !== null).map(String)
  }
  const get = (name) => (all(name)[0] ?? '').trim()
  const oneOf = (name, allowed, fallback = '') => (allowed.includes(get(name)) ? get(name) : fallback)
  // קטגוריות: פרמטר אחד מפוצל בפסיקים, או כמה פרמטרים חוזרים (קטגוריה שיש בשמה פסיק)
  const raw = all('cat')
  const parts = raw.length === 1 ? raw[0].split(',') : raw
  const cat = []
  for (const part of parts) {
    const value = part.trim().slice(0, MAX_VALUE_LENGTH)
    if (value && !cat.includes(value)) cat.push(value)
    if (cat.length >= MAX_VALUES) break
  }
  const page = Number.parseInt(get('page'), 10)
  const book = get('book')
  const legacyHidden = get('status') === 'hidden'
  return {
    q: get('q').slice(0, 200),
    status: oneOf('status', BOOK_STATUS_FILTERS),
    vis: legacyHidden ? 'hidden' : oneOf('vis', BOOK_VISIBILITY_FILTERS),
    owner: oneOf('owner', BOOK_OWNER_FILTERS),
    cat,
    sort: oneOf('sort', BOOK_SORTS, DEFAULT_BOOKS_QUERY.sort),
    page: Number.isInteger(page) && page > 1 ? page : 1,
    // מזהה Mongo — אותיות ומספרים בלבד; כל דבר אחר אינו ספר
    book: /^[a-zA-Z0-9]{1,64}$/.test(book) ? book : '',
    view: book ? oneOf('view', DRAWER_VIEWS, DEFAULT_BOOKS_QUERY.view) : DEFAULT_BOOKS_QUERY.view,
  }
}

/**
 * הכתובת של שאילתה — בלי ערכי ברירת מחדל ובסדר קבוע. "" כשאין כלום (ולא "?").
 * @param {Partial<BooksQuery>} query
 */
export function serializeBooksQuery(query) {
  const params = new URLSearchParams()
  let commaInValue = false
  for (const name of PARAM_ORDER) {
    const value = query?.[name]
    if (name === 'cat') {
      const values = (Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean)
      if (values.length === 0) continue
      if (values.some((v) => v.includes(','))) {
        commaInValue = true
        // קטגוריה שיש בשמה פסיק: כל קטגוריה בפרמטר משלה (cat=א&cat=ב), ו-parseBooksQuery לא מפצל כשיש
        // כמה פרמטרים. קטגוריה אחת כזו נכתבת פעמיים בכוונה — אחרת פרמטר יחיד היה מפוצל בפסיק; הכפילות
        // מוסרת בקריאה.
        for (const v of values) params.append(name, v)
        if (values.length === 1) params.append(name, values[0])
      } else {
        params.set(name, values.join(','))
      }
      continue
    }
    if (name === 'view' && !query?.book) continue
    if (value === undefined || value === null || value === '') continue
    if (value === DEFAULT_BOOKS_QUERY[name]) continue
    params.set(name, String(value))
  }
  const text = commaInValue ? params.toString() : params.toString().replace(/%2C/g, ',')
  return text ? `?${text}` : ''
}

/**
 * עדכון שאילתה: שינוי בסינון או במיון מחזיר לעמוד הראשון (אלא אם נקבע עמוד במפורש).
 * פתיחה וסגירה של המגירה (book / view) לא נוגעות בעמוד.
 * @param {BooksQuery} query
 * @param {Partial<BooksQuery>} patch
 */
export function updateBooksQuery(query, patch) {
  const next = { ...query, ...patch }
  const drawerOnly = Object.keys(patch).every((k) => k === 'book' || k === 'view')
  if (!('page' in patch) && !drawerOnly) next.page = 1
  if ('book' in patch && !('view' in patch)) next.view = DEFAULT_BOOKS_QUERY.view
  return next
}

/** האם יש סינון פעיל (המיון, העמוד והמגירה אינם סינון) */
export function hasActiveFilters(query) {
  return Boolean(query?.q || query?.status || query?.vis || query?.owner || query?.cat?.length)
}

/** כמה בוררי סינון פעילים — לכפתור "סינון (2)" בטלפון */
export function activeFilterCount(query) {
  return [query?.status, query?.vis, query?.owner, query?.cat?.length].filter(Boolean).length
}

/** ניקוי הסינון — המיון נשמר, והמגירה נסגרת (הספר שבה אולי כבר לא ברשימה) */
export function clearFilters(query) {
  return { ...query, q: '', status: '', vis: '', owner: '', cat: [], page: 1, book: '', view: DEFAULT_BOOKS_QUERY.view }
}

/**
 * השאילתה כפי שהיא חלה בפועל: קטגוריה שאינה ברשימה וספר שלא קיים — נזרקים. null — עוד לא ידוע (לא
 * זורקים כלום לפני שהנתונים נטענו).
 * @param {BooksQuery} query
 * @param {{ categoryKeys?: string[] | null, bookIds?: string[] | null }} known
 */
export function sanitizeBooksQuery(query, { categoryKeys = null, bookIds = null } = {}) {
  const next = { ...query }
  if (categoryKeys) next.cat = query.cat.filter((c) => categoryKeys.includes(c))
  if (bookIds && query.book && !bookIds.includes(query.book)) {
    next.book = ''
    next.view = DEFAULT_BOOKS_QUERY.view
  }
  return next
}

/** האם ספר מתאים למצב שנבחר ("לא התחילו" — יש עמודים, ואף אחד לא הושלם או בעבודה) */
export function matchesStatus(book, status) {
  if (!status) return true
  const { stage } = bookProgress(book)
  if (status === 'completed') return stage === 'completed'
  if (status === 'in_progress') return stage === 'in_progress'
  if (status === 'not_started') return stage === 'not_started'
  return true
}

/** נראות: מוסתר / מוצג לכולם */
export function matchesVisibility(book, vis) {
  if (vis === 'hidden') return book.isHidden === true
  if (vis === 'visible') return book.isHidden !== true
  return true
}

/** בעלות: "אישי" כולל גם ספר שהיה אישי והושלם (כמו בסינון הקודם), "ציבורי" — כל מה שלא אישי עכשיו */
export function matchesOwner(book, owner) {
  if (!owner) return true
  const { kind } = bookOwnership(book)
  if (owner === 'public') return kind !== 'personal'
  if (owner === 'personal') return kind === 'personal' || kind === 'was_personal'
  return true
}

/**
 * פונקציית חיפוש: כל מילה בשאילתה צריכה להופיע בשם הספר או בשם הבעלים (אותיות סופיות, ניקוד וגרשיים
 * מנורמלים). מחושבת פעם אחת לשאילתה.
 * @param {string} q
 */
export function searchMatcher(q) {
  const terms = normalizeHebrew(q || '').split(/\s+/).filter(Boolean)
  if (terms.length === 0) return () => true
  const cache = new Map()
  return (book) => {
    let text = cache.get(book.id)
    if (text === undefined) {
      const { owner } = bookOwnership(book)
      text = `${normalizeHebrew(book.name)} ${normalizeHebrew(owner || '')}`
      cache.set(book.id, text)
    }
    return terms.every((t) => text.includes(t))
  }
}

/**
 * הספרים שמתאימים לסינון.
 * @param {any[]} books
 * @param {BooksQuery} query
 */
export function filterBooks(books, query) {
  const match = searchMatcher(query.q)
  const cats = query.cat?.length ? new Set(query.cat) : null
  return books.filter((book) => (
    matchesStatus(book, query.status)
    && matchesVisibility(book, query.vis)
    && matchesOwner(book, query.owner)
    && (!cats || cats.has(displayCategory(book)))
    && match(book)
  ))
}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('he') : null
const byName = (a, b) => (collator ? collator.compare(a.name, b.name) : a.name.localeCompare(b.name))
const time = (book) => {
  const t = Date.parse(book.lastUpdated || '')
  return Number.isFinite(t) ? t : 0
}

/**
 * מיון (עותק): updated — עודכנו לאחרונה קודם; name — לפי א"ב; progress — הכי פחות התקדמו קודם
 * (ספר בלי עמודים — בסוף). שוויון — לפי שם, כדי שהסדר יהיה יציב.
 */
export function sortBooks(books, sort) {
  const list = [...books]
  if (sort === 'name') return list.sort(byName)
  if (sort === 'progress') {
    const value = (b) => {
      const p = bookProgress(b)
      return p.total === 0 ? Infinity : p.completed / p.total
    }
    return list.sort((a, b) => value(a) - value(b) || byName(a, b))
  }
  return list.sort((a, b) => time(b) - time(a) || byName(a, b))
}

/**
 * עמוד מתוך הרשימה, בגודל העמוד של מסך הספרים. עמוד שמעבר לסוף — העמוד האחרון
 * (המימוש — adminList/paginate.js).
 */
export function paginate(list, page, perPage = BOOKS_PER_PAGE) {
  return paginateList(list, page, perPage)
}

/**
 * אפשרויות בורר "מצב", עם מספר הספרים בכל אחד (מכל הספרים — לא רק המסוננים).
 * @returns {{ value: string, label: string, count: number }[]}
 */
export function statusOptions(books) {
  return BOOK_STATUS_FILTERS.map((value) => ({
    value,
    label: STATUS_FILTER_LABELS[value],
    count: books.filter((b) => matchesStatus(b, value)).length,
  }))
}

/** אפשרויות בורר "נראות", עם מספרים */
export function visibilityOptions(books) {
  return BOOK_VISIBILITY_FILTERS.map((value) => ({
    value,
    label: VISIBILITY_FILTER_LABELS[value],
    count: books.filter((b) => matchesVisibility(b, value)).length,
  }))
}

/** אפשרויות בורר "בעלות", עם מספרים */
export function ownerOptions(books) {
  return BOOK_OWNER_FILTERS.map((value) => ({
    value,
    label: OWNER_FILTER_LABELS[value],
    count: books.filter((b) => matchesOwner(b, value)).length,
  }))
}

/**
 * אפשרויות בורר "קטגוריה": הקטגוריות שבהגדרות (בסדר שלהן, עם הצבע), ואחריהן קטגוריות שיש בהן ספרים
 * אבל אינן בהגדרות (נמחקו או שונו) — כדי שאפשר יהיה למצוא גם אותם. "אישי - …" אינה קטגוריה.
 * @param {{ name: string, color?: string }[]} categories
 * @param {any[]} books
 * @returns {{ value: string, label: string, count: number, color?: string, hint?: string }[]}
 */
export function categoryOptions(categories, books) {
  const counts = new Map()
  for (const book of books) {
    const c = displayCategory(book)
    if (c) counts.set(c, (counts.get(c) || 0) + 1)
  }
  const out = []
  const seen = new Set()
  for (const cat of categories || []) {
    const name = String(cat?.name || '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({ value: name, label: name, count: counts.get(name) || 0, color: safeColor(cat.color) ?? undefined })
  }
  const orphans = [...counts.keys()].filter((name) => !seen.has(name))
  orphans.sort((a, b) => (collator ? collator.compare(a, b) : a.localeCompare(b)))
  for (const name of orphans) out.push({ value: name, label: name, count: counts.get(name), hint: 'לא בהגדרות' })
  return out
}
