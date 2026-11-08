import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupUploadsByBook } from './uploadGroups.js'
import {
  DEFAULT_UPLOADS_QUERY,
  clearFilters,
  countByBookStatus,
  filterUploadGroups,
  hasActiveFilters,
  activeFilterCount,
  paginate,
  parseUploadsQuery,
  sanitizeUploadsQuery,
  serializeUploadsQuery,
  sortUploadGroups,
  updateUploadsQuery,
  uploaderOptions,
} from './uploadsQuery.js'

test('parseUploadsQuery: מ-URLSearchParams ומאובייקט (searchParams של Next)', () => {
  assert.deepEqual(
    parseUploadsQuery(new URLSearchParams('q=חוות&type=full_book&user=m@x&status=ready&sort=oldest&page=3')),
    { q: 'חוות', type: 'full_book', user: ['m@x'], status: ['ready'], sort: 'oldest', page: 3 }
  )
  assert.deepEqual(parseUploadsQuery({ status: ['not_checked', 'ready'], page: '2' }), { ...DEFAULT_UPLOADS_QUERY, status: ['not_checked', 'ready'], page: 2 })
  assert.deepEqual(parseUploadsQuery(null), { ...DEFAULT_UPLOADS_QUERY })
})

test('parseUploadsQuery: כמה ערכים — בפסיקים או חוזרים; ריקים וכפולים נזרקים', () => {
  assert.deepEqual(parseUploadsQuery(new URLSearchParams('status=not_checked,ready')).status, ['not_checked', 'ready'])
  assert.deepEqual(parseUploadsQuery(new URLSearchParams('status=not_checked&status=ready')).status, ['not_checked', 'ready'])
  assert.deepEqual(parseUploadsQuery(new URLSearchParams('status=,ready,,ready, ')).status, ['ready'])
  assert.deepEqual(parseUploadsQuery(new URLSearchParams('user=')).user, [])
  // ערך חוזר אינו מפוצל — מפתח שיש בו פסיק נשמר
  assert.deepEqual(parseUploadsQuery(new URLSearchParams('status=a,b&status=c')).status, ['a,b', 'c'])
  // תקרה
  const many = Array.from({ length: 80 }, (_, i) => `s${i}`).join(',')
  assert.equal(parseUploadsQuery(new URLSearchParams(`status=${many}`)).status.length, 50)
})

test('parseUploadsQuery: ערכים לא מוכרים נזרקים', () => {
  const q = parseUploadsQuery(new URLSearchParams('type=dicta&sort=random&page=-4'))
  assert.equal(q.type, '')
  assert.equal(q.sort, 'newest')
  assert.equal(q.page, 1)
  assert.equal(parseUploadsQuery(new URLSearchParams('page=abc')).page, 1)
  assert.equal(parseUploadsQuery(new URLSearchParams(`q=${'א'.repeat(300)}`)).q.length, 200)
})

test('serializeUploadsQuery: בלי ברירות מחדל, בסדר קבוע, הלוך-חזור', () => {
  assert.equal(serializeUploadsQuery(DEFAULT_UPLOADS_QUERY), '')
  assert.equal(serializeUploadsQuery({ ...DEFAULT_UPLOADS_QUERY, status: ['not_checked'] }), '?status=not_checked')
  assert.equal(serializeUploadsQuery({ ...DEFAULT_UPLOADS_QUERY, status: ['not_checked', 'ready'] }), '?status=not_checked,ready')
  assert.equal(serializeUploadsQuery({ page: 2, sort: 'name', q: 'א ב' }), '?q=%D7%90+%D7%91&sort=name&page=2')
  const query = { q: 'ספר', type: 'single_page', user: ['m@x', 'd@x'], status: ['ready'], sort: 'oldest', page: 4 }
  assert.deepEqual(parseUploadsQuery(new URLSearchParams(serializeUploadsQuery(query).slice(1))), query)
  // מפתח שיש בו פסיק — הלוך-חזור דרך פרמטרים חוזרים
  for (const status of [['a,b'], ['a,b', 'c']]) {
    const q = { ...DEFAULT_UPLOADS_QUERY, status }
    assert.deepEqual(parseUploadsQuery(new URLSearchParams(serializeUploadsQuery(q).slice(1))).status, status)
  }
})

test('updateUploadsQuery: שינוי סינון מחזיר לעמוד 1; שינוי עמוד — לא', () => {
  const query = { ...DEFAULT_UPLOADS_QUERY, page: 5 }
  assert.equal(updateUploadsQuery(query, { status: ['ready'] }).page, 1)
  assert.equal(updateUploadsQuery(query, { page: 6 }).page, 6)
})

test('hasActiveFilters ו-clearFilters: מיון אינו סינון, וניקוי שומר את המיון', () => {
  assert.equal(hasActiveFilters({ ...DEFAULT_UPLOADS_QUERY, sort: 'name', page: 3 }), false)
  assert.equal(hasActiveFilters({ ...DEFAULT_UPLOADS_QUERY, user: ['x'] }), true)
  assert.equal(hasActiveFilters({ ...DEFAULT_UPLOADS_QUERY, status: [] }), false)
  assert.equal(activeFilterCount({ ...DEFAULT_UPLOADS_QUERY, status: ['a', 'b'], type: 'full_book' }), 2)
  assert.deepEqual(clearFilters({ q: 'a', type: 'full_book', user: ['u'], status: ['s'], sort: 'name', page: 4 }),
    { q: '', type: '', user: [], status: [], sort: 'name', page: 1 })
})

test('sanitizeUploadsQuery: מצב / משתמש שלא קיימים נזרקים; באשפה אין מצב; לפני טעינה — כלום', () => {
  const q = { ...DEFAULT_UPLOADS_QUERY, status: ['xyz', 'ready'], user: ['nobody@x'] }
  assert.deepEqual(sanitizeUploadsQuery(q, { tab: 'uploads', statusKeys: ['ready', 'not_checked'], userKeys: ['m@x'] }),
    { ...q, status: ['ready'], user: [] })
  assert.deepEqual(sanitizeUploadsQuery(q, { tab: 'trash', statusKeys: null, userKeys: null }).status, [])
  assert.equal(sanitizeUploadsQuery(q, { tab: 'uploads', statusKeys: null, userKeys: null }), q)
  const ok = { ...DEFAULT_UPLOADS_QUERY, status: ['ready'] }
  assert.equal(sanitizeUploadsQuery(ok, { tab: 'uploads', statusKeys: new Set(['ready']), userKeys: [] }), ok)
})

const uploads = [
  { id: '1', bookName: 'ריטב״א-ב״ב - עמוד 4', uploadedAt: '2025-01-04', uploadType: 'single_page', bookStatus: 'ready', uploadedBy: 'משה', uploadedByEmail: 'm@x' },
  { id: '2', bookName: 'ריטב״א-ב״ב - עמוד 5', uploadedAt: '2025-01-05', uploadType: 'single_page', bookStatus: 'not_checked', uploadedBy: 'דוד', uploadedByEmail: 'd@x' },
  { id: '3', bookName: 'אסופות ומאמרים', originalFileName: 'asufot.txt', uploadedAt: '2025-01-03', uploadType: 'full_book' },
  { id: '4', bookName: 'בית מאיר', uploadedAt: '2025-01-01', uploadType: 'dicta', bookStatus: 'added_to_library' },
]
const groups = groupUploadsByBook(uploads)
const visibleIds = (query) => filterUploadGroups(groups, { ...DEFAULT_UPLOADS_QUERY, ...query }).map((g) => g.visible.map((u) => u.id))

test('filterUploadGroups: בלי סינון — הכול', () => {
  assert.deepEqual(visibleIds({}), [['2', '1'], ['3'], ['4']])
})

test('filterUploadGroups: לפי סוג, מצב ומשתמש — בתוך הקבוצה', () => {
  assert.deepEqual(visibleIds({ type: 'full_book' }), [['3']])
  assert.deepEqual(visibleIds({ status: ['not_checked'] }), [['2'], ['3']]) // בלי bookStatus = לא נבדק
  assert.deepEqual(visibleIds({ status: ['not_checked', 'added_to_library'] }), [['2'], ['3'], ['4']])
  assert.deepEqual(visibleIds({ user: ['m@x'] }), [['1']])
  assert.deepEqual(visibleIds({ user: ['m@x', 'd@x'] }), [['2', '1']])
  assert.deepEqual(visibleIds({ user: ['אורח'] }), [['3'], ['4']])
  assert.deepEqual(visibleIds({ type: 'single_page', status: ['added_to_library'] }), [])
})

test('filterUploadGroups: חיפוש מנורמל — גרשיים, מקפים, מספר עמוד ושם קובץ', () => {
  assert.deepEqual(visibleIds({ q: 'ריטבא בב' }), [['2', '1']])
  assert.deepEqual(visibleIds({ q: 'עמוד 5' }), [['2']])
  assert.deepEqual(visibleIds({ q: 'asufot' }), [['3']])
  assert.deepEqual(visibleIds({ q: 'אין כזה' }), [])
})

test('filterUploadGroups: הקבוצה המלאה נשמרת לצד הגלויות', () => {
  const [group] = filterUploadGroups(groups, { ...DEFAULT_UPLOADS_QUERY, user: ['m@x'] })
  assert.equal(group.uploads.length, 2)
  assert.equal(group.visible.length, 1)
})

test('"הוותיקים קודם" — לפי ההעלאות שמוצגות, לא לפי עמוד ישן שכבר טופל', () => {
  const list = [
    { id: 'a1', bookName: 'חוות דעת - עמוד 1', uploadedAt: '2025-11-01', bookStatus: 'in_edit' },
    { id: 'a2', bookName: 'חוות דעת - עמוד 2', uploadedAt: '2026-03-17', bookStatus: 'not_checked' },
    { id: 'b1', bookName: 'אבן שהם', uploadedAt: '2026-03-01', bookStatus: 'not_checked' },
  ]
  const shown = filterUploadGroups(groupUploadsByBook(list), { ...DEFAULT_UPLOADS_QUERY, status: ['not_checked'] })
  assert.deepEqual(sortUploadGroups(shown, 'oldest').map((g) => g.title), ['אבן שהם', 'חוות דעת'])
  const hawot = shown.find((g) => g.title === 'חוות דעת')
  assert.equal(hawot.earliest, new Date('2026-03-17').getTime())
  // בלי סינון — הספר כולו
  assert.deepEqual(sortUploadGroups(filterUploadGroups(groupUploadsByBook(list), DEFAULT_UPLOADS_QUERY), 'oldest').map((g) => g.title), ['חוות דעת', 'אבן שהם'])
})

test('ביצועים (גס): חיפוש ב-4,000 העלאות — מתחת ל-50ms אחרי החימום', () => {
  const big = Array.from({ length: 4000 }, (_, i) => ({
    id: String(i), bookName: `ספר-מספר-${i % 300} - עמוד ${i}`, originalFileName: `file-${i}.txt`,
    uploadedAt: new Date(2026, 0, 1 + (i % 300)).toISOString(), bookStatus: i % 3 ? 'not_checked' : 'ready',
    uploadedBy: `משתמש ${i % 150}`, uploadedByEmail: `u${i % 150}@x`,
  }))
  const grouped = groupUploadsByBook(big)
  const run = (q) => filterUploadGroups(grouped, { ...DEFAULT_UPLOADS_QUERY, q })
  for (const q of ['ספר', 'עמוד 12', 'א']) run(q) // חימום (טקסטי החיפוש מחושבים פעם אחת)
  const times = ['ספר מספר 12', 'עמוד 3', 'file 99', 'א', 'אין כזה'].map((q) => {
    const start = performance.now()
    run(q)
    return performance.now() - start
  })
  assert.ok(Math.max(...times) < 50, `חיפוש איטי: ${times.map((t) => t.toFixed(1)).join(' / ')} ms`)
  // קיבוץ מחדש (אחרי שינוי מצב) — בלי לפרק שוב את השמות
  const start = performance.now()
  groupUploadsByBook(big.map((u, i) => (i === 5 ? { ...u, bookStatus: 'ready' } : u)))
  assert.ok(performance.now() - start < 150, 'קיבוץ מחדש איטי')
})

test('sortUploadGroups: חדשים, ותיקים, שם', () => {
  const titles = (sort) => sortUploadGroups(groups, sort).map((g) => g.title)
  assert.deepEqual(titles('newest'), ['ריטב״א ב״ב', 'אסופות ומאמרים', 'בית מאיר'])
  assert.deepEqual(titles('oldest'), ['בית מאיר', 'אסופות ומאמרים', 'ריטב״א ב״ב'])
  assert.deepEqual(titles('name'), ['אסופות ומאמרים', 'בית מאיר', 'ריטב״א ב״ב'])
  assert.notEqual(sortUploadGroups(groups, 'name'), groups) // לא משנה את המקור
})

test('paginate: טווח, עמוד מעבר לסוף, רשימה ריקה', () => {
  const items = Array.from({ length: 53 }, (_, i) => i)
  assert.deepEqual({ ...paginate(items, 2, 25), items: undefined }, { items: undefined, page: 2, pageCount: 3, total: 53, from: 26, to: 50 })
  const last = paginate(items, 99, 25)
  assert.equal(last.page, 3)
  assert.deepEqual(last.items, [50, 51, 52])
  assert.deepEqual(paginate([], 1, 25), { items: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 })
})

test('uploaderOptions ו-countByBookStatus', () => {
  assert.deepEqual(uploaderOptions(uploads), [
    { value: 'אורח', label: 'אורח', count: 2 },
    { value: 'd@x', label: 'דוד', count: 1, hint: 'd@x' },
    { value: 'm@x', label: 'משה', count: 1, hint: 'm@x' },
  ])
  assert.deepEqual([...countByBookStatus(uploads)], [['ready', 1], ['not_checked', 2], ['added_to_library', 1]])
})
