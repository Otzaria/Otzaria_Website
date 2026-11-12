import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBook } from './bookTerms.js'
import {
  DEFAULT_BOOKS_QUERY,
  activeFilterCount,
  categoryOptions,
  clearFilters,
  filterBooks,
  hasActiveFilters,
  ownerOptions,
  paginate,
  parseBooksQuery,
  sanitizeBooksQuery,
  serializeBooksQuery,
  sortBooks,
  statusOptions,
  visibilityOptions,
  updateBooksQuery,
} from './booksQuery.js'

const B = (over) => normalizeBook({ totalPages: 10, completedPages: 0, inProgressPages: 0, category: 'כללי', ...over })
const books = [
  B({ id: 'a1', name: 'חוות דעת', totalPages: 100, completedPages: 40, category: 'אחרונים', lastUpdated: '2026-10-01T00:00:00Z' }),
  B({ id: 'b2', name: 'אור החיים', totalPages: 50, completedPages: 50, category: 'ראשונים', lastUpdated: '2026-10-05T00:00:00Z' }),
  B({ id: 'c3', name: 'ספר המידות', isHidden: true, category: 'ראשונים', lastUpdated: '2026-09-01T00:00:00Z' }),
  B({ id: 'd4', name: 'מעיין נדה', ownerId: 'u1', ownerName: 'דוד דוד', isHidden: true, category: 'אישי - ד.ד.', inProgressPages: 2, lastUpdated: '2026-10-03T00:00:00Z' }),
  B({ id: 'e5', name: 'בית יוסף', originalOwnerId: 'u2', originalOwnerName: 'שמעון', totalPages: 0, category: 'ישנה', lastUpdated: null }),
]
const q = (over = {}) => ({ ...DEFAULT_BOOKS_QUERY, cat: [], ...over })

test('קריאה מהכתובת: ערכים לא מוכרים נזרקים, ערכים מוכרים נשמרים', () => {
  const parsed = parseBooksQuery(new URLSearchParams('q= חוות &status=hidden&owner=personal&cat=ראשונים,אחרונים&sort=name&page=3&book=abc123&view=ocr'))
  // ?status=hidden (קישור ישן) — נקרא כנראות
  assert.deepEqual(parsed, { q: 'חוות', status: '', vis: 'hidden', owner: 'personal', cat: ['ראשונים', 'אחרונים'], sort: 'name', page: 3, book: 'abc123', view: 'ocr' })
  assert.deepEqual(
    [parseBooksQuery(new URLSearchParams('status=not_started&vis=visible')).status, parseBooksQuery(new URLSearchParams('status=not_started&vis=visible')).vis],
    ['not_started', 'visible'],
  )
  const bad = parseBooksQuery(new URLSearchParams('status=xyz&owner=mine&sort=random&page=-2&book=../x&view=zzz'))
  assert.deepEqual(bad, { ...DEFAULT_BOOKS_QUERY, cat: [] })
  // לשונית מגירה בלי ספר — אין מה לפתוח
  assert.equal(parseBooksQuery(new URLSearchParams('view=ocr')).view, 'details')
  // קטגוריה שיש בשמה פסיק — כפרמטרים חוזרים
  assert.deepEqual(parseBooksQuery(new URLSearchParams('cat=א,ב&cat=ג')).cat, ['א,ב', 'ג'])
})

test('כתיבה לכתובת: בלי ברירות מחדל, בסדר קבוע, ופסיק קריא', () => {
  assert.equal(serializeBooksQuery(DEFAULT_BOOKS_QUERY), '')
  assert.equal(serializeBooksQuery(q({ cat: ['ראשונים', 'אחרונים'], status: 'completed', page: 2 })), `?status=completed&cat=${encodeURIComponent('ראשונים')},${encodeURIComponent('אחרונים')}&page=2`)
  assert.equal(serializeBooksQuery(q({ book: 'abc', view: 'details' })), '?book=abc')
  assert.equal(serializeBooksQuery(q({ book: 'abc', view: 'pages' })), '?book=abc&view=pages')
  // view בלי ספר לא נכתב
  assert.equal(serializeBooksQuery(q({ view: 'pages' })), '')
  // הלוך-חזור
  const query = q({ q: 'אור', owner: 'public', cat: ['א,ב'], sort: 'progress', book: 'b2', view: 'instructions' })
  assert.deepEqual(parseBooksQuery(new URLSearchParams(serializeBooksQuery(query).slice(1))), query)
})

test('עדכון: סינון מחזיר לעמוד 1; פתיחת מגירה לא; ספר אחר — ללשונית הראשונה', () => {
  const base = q({ page: 3, book: 'a1', view: 'ocr' })
  assert.equal(updateBooksQuery(base, { status: 'hidden' }).page, 1)
  assert.equal(updateBooksQuery(base, { book: 'b2' }).page, 3)
  assert.equal(updateBooksQuery(base, { book: 'b2' }).view, 'details')
  assert.equal(updateBooksQuery(base, { view: 'pages' }).page, 3)
  assert.equal(updateBooksQuery(base, { page: 2 }).page, 2)
})

test('סינון פעיל, מספר בוררים, וניקוי ששומר את המיון וסוגר את המגירה', () => {
  assert.equal(hasActiveFilters(q()), false)
  assert.equal(hasActiveFilters(q({ book: 'a1', sort: 'name' })), false)
  assert.equal(hasActiveFilters(q({ q: 'א' })), true)
  assert.equal(activeFilterCount(q({ q: 'א', status: 'hidden', cat: ['x', 'y'] })), 2)
  const cleared = clearFilters(q({ q: 'א', status: 'hidden', owner: 'public', cat: ['x'], sort: 'name', page: 4, book: 'a1', view: 'ocr' }))
  assert.deepEqual(cleared, q({ sort: 'name' }))
})

test('ניקוי ערכים לא קיימים: קטגוריה וספר — רק כשהנתונים ידועים', () => {
  const query = q({ cat: ['ראשונים', 'נמחקה'], book: 'zz', view: 'ocr' })
  assert.deepEqual(sanitizeBooksQuery(query), query)
  const clean = sanitizeBooksQuery(query, { categoryKeys: ['ראשונים'], bookIds: ['a1'] })
  assert.deepEqual(clean.cat, ['ראשונים'])
  assert.equal(clean.book, '')
  assert.equal(clean.view, 'details')
  assert.equal(sanitizeBooksQuery(q({ book: 'a1' }), { bookIds: ['a1'] }).book, 'a1')
})

test('סינון לפי מצב: בעבודה (התחיל ולא הושלם, כולל עמודים שנלקחו), הושלם, מוסתר', () => {
  const ids = (query) => filterBooks(books, q(query)).map((b) => b.id)
  assert.deepEqual(ids({ status: 'in_progress' }), ['a1', 'd4'])
  assert.deepEqual(ids({ status: 'completed' }), ['b2'])
  assert.deepEqual(ids({ vis: 'hidden' }), ['c3', 'd4'])
  assert.deepEqual(ids({ vis: 'hidden', status: 'in_progress' }), ['d4'])
})

test('סינון לפי בעלות: אישי כולל "היה אישי"; ציבורי — כל מה שלא אישי עכשיו', () => {
  const ids = (owner) => filterBooks(books, q({ owner })).map((b) => b.id)
  assert.deepEqual(ids('personal'), ['d4', 'e5'])
  assert.deepEqual(ids('public'), ['a1', 'b2', 'c3', 'e5'])
})

test('סינון לפי קטגוריה וחיפוש בשם הספר ובשם הבעלים (בלי תלות באותיות סופיות)', () => {
  assert.deepEqual(filterBooks(books, q({ cat: ['ראשונים'] })).map((b) => b.id), ['b2', 'c3'])
  assert.deepEqual(filterBooks(books, q({ q: 'מעין' })).map((b) => b.id), [])
  assert.deepEqual(filterBooks(books, q({ q: 'מעיין' })).map((b) => b.id), ['d4'])
  assert.deepEqual(filterBooks(books, q({ q: 'דוד' })).map((b) => b.id), ['d4'])
  assert.deepEqual(filterBooks(books, q({ q: 'שמעון' })).map((b) => b.id), ['e5'])
  assert.deepEqual(filterBooks(books, q({ q: 'חוות דעת' })).map((b) => b.id), ['a1'])
  // ספר אישי לא נמצא בקטגוריה "אישי - …" (היא בעלות, לא קטגוריה)
  assert.deepEqual(filterBooks(books, q({ cat: ['אישי - ד.ד.'] })).map((b) => b.id), [])
})

test('מיון: עודכנו לאחרונה (ברירת מחדל), לפי שם, ולפי התקדמות (בלי עמודים — בסוף)', () => {
  assert.deepEqual(sortBooks(books, 'updated').map((b) => b.id), ['b2', 'd4', 'a1', 'c3', 'e5'])
  assert.deepEqual(sortBooks(books, 'name').map((b) => b.name), ['אור החיים', 'בית יוסף', 'חוות דעת', 'מעיין נדה', 'ספר המידות'])
  assert.deepEqual(sortBooks(books, 'progress').map((b) => b.id), ['d4', 'c3', 'a1', 'b2', 'e5'])
  // לא משנה את המקור
  assert.equal(books[0].id, 'a1')
})

test('עימוד: עמוד מעבר לסוף — האחרון; טווח מוצג', () => {
  const list = Array.from({ length: 120 }, (_, i) => i)
  assert.deepEqual({ ...paginate(list, 2), items: undefined }, { items: undefined, page: 2, pageCount: 3, from: 51, to: 100, total: 120 })
  assert.equal(paginate(list, 9).page, 3)
  assert.equal(paginate(list, 9).items.length, 20)
  assert.deepEqual({ ...paginate([], 1), items: undefined }, { items: undefined, page: 1, pageCount: 1, from: 0, to: 0, total: 0 })
})

test('אפשרויות הבוררים עם מספרים', () => {
  assert.deepEqual(statusOptions(books).map((o) => o.label), ['לא התחילו', 'בעבודה', 'הושלם'])
  assert.deepEqual(visibilityOptions(books).map((o) => [o.label, o.count]), [['מוסתר', 2], ['מוצג לכולם', books.length - 2]])
  assert.deepEqual(ownerOptions(books).map((o) => [o.label, o.count]), [['ציבורי', 4], ['אישי', 2]])
})

test('אפשרויות קטגוריה: לפי ההגדרות (עם צבע תקין בלבד), ואחריהן קטגוריות שאינן בהגדרות', () => {
  const opts = categoryOptions([{ name: 'ראשונים', color: '#38571A' }, { name: 'אחרונים', color: 'javascript:x' }, { name: 'חסידות', color: '#ff4013' }], books)
  assert.deepEqual(opts, [
    { value: 'ראשונים', label: 'ראשונים', count: 2, color: '#38571a' },
    { value: 'אחרונים', label: 'אחרונים', count: 1, color: undefined },
    { value: 'חסידות', label: 'חסידות', count: 0, color: '#ff4013' },
    { value: 'ישנה', label: 'ישנה', count: 1, hint: 'לא בהגדרות' },
  ])
})
