// "הצעות עריכה" (/library/dicta-edit/moderation) — הסינון, המיון והעמוד מהכתובת ואליה, ובחירת ההצעות
// שמוצגות. לוגיקה טהורה, בלי React ובלי DOM (נבדק ב-suggestionsQuery.test.mjs).
//
// הרשימה מגיעה כולה מ-GET /api/library/edits?status=pending (עד 500, החדשה קודם) — הסינון, המיון
// והעימוד בצד הלקוח, בלי שינוי בבקשה.

import { paginate as paginateList } from '../adminList/paginate.js'

export const SUGGESTIONS_PER_PAGE = 20
export const SUGGESTION_KINDS = ['manual', 'find-replace']
export const SUGGESTION_SORTS = ['newest', 'oldest']
const DEFAULT_SORT = 'newest'
const PARAM_ORDER = ['book', 'author', 'kind', 'sort', 'page']

/** @typedef {{ book: string, author: string, kind: string, sort: string, page: number }} SuggestionsQuery */

function reader(params) {
  return (name) => {
    if (!params) return ''
    const value = typeof params.get === 'function' ? params.get(name) : params[name]
    return String((Array.isArray(value) ? value[0] : value) ?? '').trim()
  }
}

/**
 * @param {URLSearchParams | Record<string, string | string[] | undefined> | null | undefined} params
 * @returns {SuggestionsQuery}
 */
export function parseSuggestionsQuery(params) {
  const get = reader(params)
  const kind = get('kind')
  const sort = get('sort')
  const page = Number.parseInt(get('page'), 10)
  return {
    book: get('book').slice(0, 300),
    author: /^[A-Za-z0-9_-]{1,64}$/.test(get('author')) ? get('author') : '',
    kind: SUGGESTION_KINDS.includes(kind) ? kind : '',
    sort: SUGGESTION_SORTS.includes(sort) ? sort : DEFAULT_SORT,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** הכתובת של שאילתה — בלי ערכי ברירת מחדל ובסדר קבוע; "" כשאין כלום */
export function serializeSuggestionsQuery(query) {
  const params = new URLSearchParams()
  for (const name of PARAM_ORDER) {
    const value = query?.[name]
    if (value === undefined || value === null || value === '') continue
    if (name === 'sort' && value === DEFAULT_SORT) continue
    if (name === 'page' && Number(value) <= 1) continue
    params.set(name, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** שינוי בסינון / במיון — חוזרים לעמוד הראשון (חוץ משינוי העמוד עצמו) */
export function updateSuggestionsQuery(query, patch) {
  return { ...query, ...patch, page: 'page' in patch ? (patch.page ?? query.page) : 1 }
}

export function activeFilterCount(query) {
  return [query.book, query.author, query.kind].filter(Boolean).length
}

/**
 * מה מסונן, במילים: "בראשית, ישראל ישראלי" — לשורת הסיכום בטלפון ולמצב הריק ("אין הצעות שמתאימות").
 * @param {SuggestionsQuery} query
 * @param {{ books: any[], authors: any[], kinds: any[] }} options
 */
export function filterSummary(query, options) {
  const pairs = [['book', options?.books], ['author', options?.authors], ['kind', options?.kinds]]
  return pairs.map(([id, list]) => (query?.[id] ? (list || []).find((o) => o.value === query[id])?.label : null)).filter(Boolean)
}

export function clearFilters(query) {
  return { ...query, book: '', author: '', kind: '', page: 1 }
}

/** שם הספר מתוך הנתיב במאגר: בלי תיקיית הקטגוריה הראשונה ובלי ".txt" ("תנך/בראשית.txt" → "בראשית") */
export function bookName(path) {
  if (!path) return ''
  return path.split('/').slice(1).join('/').replace(/\.txt$/, '') || path
}

/** שם הספר של הצעה — ובהצעה בלי נתיב, "ספר בלי שם" (כמו בהתנגשויות), כדי שהכותרת והשמות הנגישים לא יישארו ריקים */
export function suggestionBookName(edit) {
  return bookName(edit?.bookPath) || 'ספר בלי שם'
}

/**
 * הצעת חיפוש והחלפה — לפי הסוג ולפי find שאינו ריק, כמו בקוד הקודם (isFR && findReplace). לא לפי
 * edit.findReplace לבד: בסכמה (models/BookEdit.js) הוא אובייקט מקונן עם ברירות מחדל, ולכן הוא קיים גם
 * בכל הצעה ידנית — { find: null, replace: null, isRegex: false }.
 */
export function isFindReplace(edit) {
  const find = edit?.findReplace?.find
  return edit?.kind === 'find-replace' && typeof find === 'string' && find !== ''
}

const time = (value) => {
  const ms = new Date(value ?? NaN).getTime()
  return Number.isFinite(ms) ? ms : 0
}

/**
 * ההצעות שמתאימות לסינון, בסדר המיון. ספר — לפי הנתיב המלא (שני ספרים באותו שם בקטגוריות שונות
 * נשארים נפרדים); מציע — לפי המזהה (שני מציעים באותו שם נשארים נפרדים).
 * @param {any[]} edits
 * @param {SuggestionsQuery} query
 */
export function filterSuggestions(edits, query) {
  const out = (edits || []).filter((e) => (!query.book || e.bookPath === query.book)
    && (!query.author || String(e.author) === query.author)
    && (!query.kind || e.kind === query.kind))
  const dir = query.sort === 'oldest' ? 1 : -1
  return out.sort((a, b) => dir * (time(a.createdAt) - time(b.createdAt)))
}

function countBy(edits, keyOf, labelOf) {
  const map = new Map()
  for (const e of edits || []) {
    const key = keyOf(e)
    if (!key) continue
    const entry = map.get(key) || { value: key, label: labelOf(e), count: 0 }
    entry.count += 1
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'he') || b.count - a.count)
}

/**
 * אפשרויות הבוררים, עם מספר ההצעות בכל אחת — לפי א"ב (ברשימה ארוכה מחפשים שם, לא דירוג).
 * ספר עם אותו שם בשתי קטגוריות — הקטגוריה כרמז (hint), כדי שיהיה אפשר להבחין.
 * @param {any[]} edits
 */
export function filterOptions(edits) {
  const books = countBy(edits, (e) => e.bookPath, (e) => bookName(e.bookPath))
  const sameName = new Map()
  for (const b of books) sameName.set(b.label, (sameName.get(b.label) || 0) + 1)
  for (const b of books) {
    if (sameName.get(b.label) > 1) b.hint = b.value.split('/')[0]
  }
  const authors = countBy(edits, (e) => (e.author ? String(e.author) : ''), (e) => e.authorName || 'משתמש לא ידוע')
  const kinds = SUGGESTION_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind], count: (edits || []).filter((e) => e.kind === kind).length }))
  return { books, authors, kinds }
}

export const KIND_LABELS = { manual: 'עריכה ידנית', 'find-replace': 'חיפוש והחלפה' }

/** סינון שמצביע על ערך שכבר לא ברשימה (ספר שכל ההצעות שלו טופלו) — נזרק, כשהרשימה ידועה */
export function sanitizeSuggestionsQuery(query, edits) {
  if (!edits) return query
  const next = { ...query }
  if (next.book && !edits.some((e) => e.bookPath === next.book)) next.book = ''
  if (next.author && !edits.some((e) => String(e.author) === next.author)) next.author = ''
  return next
}

export function paginate(items, page, size = SUGGESTIONS_PER_PAGE) {
  return paginateList(items, page, size)
}

/** כמה חלקים ממתינים בהצעה (חלק בלי status — ממתין, כמו בשרת) */
export function pendingParts(edit) {
  return (edit?.changes || []).filter((c) => (c.status || 'pending') === 'pending').length
}

/** הצעה שחלק מהחלקים שלה כבר אושרו או נדחו, וחלק עדיין ממתין (מתוך החלקים שהגיעו מהשרת) */
export function partiallyHandled(edit) {
  const pending = pendingParts(edit)
  return pending > 0 && pending < (edit?.changes || []).length
}

/**
 * השרת מחזיר עד 50 חלקים לכל הצעה (api/library/edits, changes.slice(0, 50)), ו-changeCount הוא המספר
 * המלא. כשיש יותר — אי אפשר לדעת כמה מהשאר ממתינים, ולכן לא סופרים "X מתוך Y".
 */
export function partsTruncated(edit) {
  return (edit?.changeCount ?? 0) > (edit?.changes || []).length
}

/**
 * היעד של "פתח בספר": העורך של הספר, ממוקד בחלק הראשון שממתין (פרמטר find שהעורך כבר קורא).
 * חלק שמוסיף טקסט בלבד (before ריק) — אין מה לחפש בספר; פותחים בלי מיקוד.
 * @param {any} edit
 */
export function openInBookHref(edit) {
  const base = `/library/dicta-edit/${encodeURIComponent(String(edit?.book ?? ''))}`
  const first = (edit?.changes || []).find((c) => (c.status || 'pending') === 'pending' && String(c.before || '').trim())
  const find = first ? String(first.before).trim().split('\n')[0].slice(0, 200) : ''
  return find ? `${base}?find=${encodeURIComponent(find)}` : base
}
