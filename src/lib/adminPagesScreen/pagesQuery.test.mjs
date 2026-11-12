import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePagesQuery, serializePagesQuery, updatePagesQuery, activeFilterCount, clearFilters, batchDownloadUrl,
  filterPages, paginate, filterOptions, filterSummary, PAGES_PER_PAGE, isUserId, jumpTarget,
} from './pagesQuery.js'

const U1 = '64b7f0c2a1d3e4f5a6b7c8d9'

const DAY = 86400000
const NOW = Date.parse('2026-11-06T12:00:00Z')
const P = [
  { id: '1', bookName: 'מסילת ישרים', number: 2, status: 'in-progress', updatedAt: new Date(NOW - 20 * DAY).toISOString() },
  { id: '2', bookName: 'אורחות צדיקים', number: 5, status: 'available', updatedAt: new Date(NOW - 50 * DAY).toISOString() },
  { id: '3', bookName: 'מסילת ישרים', number: 1, status: 'in-progress', updatedAt: new Date(NOW - 3 * DAY).toISOString() },
  { id: '4', bookName: 'אורחות צדיקים', number: 1, status: 'completed', updatedAt: new Date(NOW - 1 * DAY).toISOString() },
  { id: '5', bookName: 'חובות הלבבות', number: 9, status: 'in-progress', updatedAt: null },
]
const Q = parsePagesQuery(null)

test('parse: ברירות מחדל וערכים לא מוכרים נזרקים', () => {
  assert.deepEqual(Q, { status: '', book: '', user: '', stale: 0, sort: 'book', page: 1 })
  assert.deepEqual(parsePagesQuery(new URLSearchParams('status=pending&stale=9&sort=x&page=-1&user=<a>')), Q)
  assert.deepEqual(parsePagesQuery({ status: 'completed', book: ' מסילת ישרים ', user: U1, sort: 'oldest', page: '3' }),
    { status: 'completed', book: 'מסילת ישרים', user: U1, stale: 0, sort: 'oldest', page: 3 })
  // מזהה משתמש שאינו ObjectId — השרת היה מחזיר 500
  assert.equal(parsePagesQuery({ user: 'abc' }).user, '')
  assert.equal(isUserId(U1), true)
  assert.equal(isUserId('abc'), false)
  assert.equal(isUserId(`${U1}0`), false)
})

test('parse: "בעבודה יותר מ-" גורר מצב "בעבודה"', () => {
  assert.equal(parsePagesQuery({ stale: '14', status: 'completed' }).status, 'in-progress')
  assert.equal(parsePagesQuery({ stale: '14' }).stale, 14)
})

test('serialize: בלי ברירות מחדל, הלוך-חזור; status מושמט כשיש stale', () => {
  assert.equal(serializePagesQuery(Q), '')
  const q = { status: 'in-progress', book: 'ספר א', user: U1, stale: 14, sort: 'newest', page: 2 }
  const s = serializePagesQuery(q)
  assert.equal(s.includes('status='), false)
  assert.deepEqual(parsePagesQuery(new URLSearchParams(s.slice(1))), q)
  const q2 = { ...Q, status: 'completed', book: 'ב' }
  assert.deepEqual(parsePagesQuery(new URLSearchParams(serializePagesQuery(q2).slice(1))), q2)
})

test('update: סינון מחזיר לעמוד 1, ו-stale ומצב תלויים זה בזה', () => {
  const at3 = { ...Q, page: 3 }
  assert.equal(updatePagesQuery(at3, { book: 'x' }).page, 1)
  assert.equal(updatePagesQuery(at3, { page: 4 }).page, 4)
  const stale = updatePagesQuery(Q, { stale: 7 })
  assert.equal(stale.status, 'in-progress')
  assert.equal(updatePagesQuery(stale, { status: 'completed' }).stale, 0)
  assert.equal(updatePagesQuery(stale, { status: '' }).stale, 0)
  assert.equal(updatePagesQuery(stale, { status: 'in-progress' }).stale, 7)
  assert.equal(updatePagesQuery(stale, { stale: 0 }).status, 'in-progress')
})

test('update: "בלי שינוי יותר מ-" מחליף את המיון ל"הוותיקים קודם" — אלא אם נבחר מיון אחר ביד', () => {
  assert.equal(updatePagesQuery(Q, { stale: 7 }).sort, 'oldest')
  assert.equal(updatePagesQuery({ ...Q, sort: 'newest' }, { stale: 7 }).sort, 'newest')
  // שינוי ימים כשכבר מסונן — המיון (גם אם שונה ביד ל"לפי ספר") נשאר
  assert.equal(updatePagesQuery({ ...Q, status: 'in-progress', stale: 7, sort: 'book' }, { stale: 14 }).sort, 'book')
  assert.equal(updatePagesQuery(Q, { stale: 7, sort: 'book' }).sort, 'book')
})

test('activeFilterCount / clearFilters', () => {
  const q = { ...Q, status: 'in-progress', book: 'x', user: 'u', stale: 7, sort: 'oldest', page: 3 }
  // "בלי שינוי יותר מ-" נספר אחד — "בעבודה" שנבחר איתו לא נספר שוב
  assert.equal(activeFilterCount(q), 3)
  assert.equal(activeFilterCount({ ...Q, status: 'in-progress', stale: 14 }), 1)
  assert.equal(activeFilterCount({ ...Q, status: 'in-progress' }), 1)
  assert.deepEqual(clearFilters(q), { ...Q, sort: 'oldest' })
})

test('batchDownloadUrl keeps the legacy export filters', () => {
  assert.equal(batchDownloadUrl({ ...Q, user: 'u1' }), '/api/admin/pages/download-batch?userId=u1')
})

test('filterPages: מצב, "בעבודה יותר מ-" (בלי תאריך — ותיק) ומיון', () => {
  assert.deepEqual(filterPages(P, Q, NOW).map((p) => p.id), ['4', '2', '5', '3', '1'])
  assert.deepEqual(filterPages(P, { ...Q, status: 'in-progress' }, NOW).map((p) => p.id), ['5', '3', '1'])
  assert.deepEqual(filterPages(P, { ...Q, status: 'in-progress', stale: 14 }, NOW).map((p) => p.id), ['5', '1'])
  assert.deepEqual(filterPages(P, { ...Q, sort: 'oldest' }, NOW).map((p) => p.id), ['5', '2', '1', '3', '4'])
  assert.deepEqual(filterPages(P, { ...Q, sort: 'newest' }, NOW).map((p) => p.id), ['4', '3', '1', '2', '5'])
  assert.deepEqual(filterPages(null, Q, NOW), [])
})

test('filterPages: עמוד ששוחרר במסך (keep) נשאר במקומו גם כשכבר לא מתאים לסינון', () => {
  const released = P.map((p) => (p.id === '1' ? { ...p, status: 'available' } : p))
  const q = { ...Q, status: 'in-progress', stale: 14 }
  assert.deepEqual(filterPages(released, q, NOW).map((p) => p.id), ['5'])
  assert.deepEqual(filterPages(released, q, NOW, new Set(['1'])).map((p) => p.id), ['5', '1'])
})

test('paginate: 50 בעמוד', () => {
  const many = Array.from({ length: 120 }, (_, i) => ({ id: String(i) }))
  const p = paginate(many, 3)
  assert.equal(PAGES_PER_PAGE, 50)
  assert.deepEqual([p.page, p.pageCount, p.from, p.to, p.items.length], [3, 3, 101, 120, 20])
  assert.equal(paginate(many, 99).page, 3)
})

test('filterOptions / filterSummary', () => {
  const o = filterOptions({ books: ['א', 'ב'], users: [{ id: 'u1', name: 'משה' }, { id: 'u2', name: '' }] })
  assert.deepEqual(o.statuses.map((s) => s.label), ['פנוי', 'בעבודה', 'הושלם'])
  assert.deepEqual(o.users[1], { value: 'u2', label: '(בלי שם)' })
  assert.deepEqual(o.stale.map((s) => s.value), ['3', '7', '14'])
  assert.ok(o.stale.every((s) => s.description))
  assert.deepEqual(filterOptions().books, [])
  assert.deepEqual(filterSummary({ ...Q, status: 'in-progress', book: 'א', user: 'u1', stale: 14 }, o), ['בלי שינוי יותר מ-14 ימים', 'א', 'משה'])
  assert.deepEqual(filterSummary({ ...Q, user: 'zz' }, o), ['משתמש'])
})

test('jumpTarget: באיזה עמוד של הרשימה נמצא מספר עמוד', () => {
  const list = Array.from({ length: 120 }, (_, i) => ({ id: `x${i}`, number: i + 1 }))
  assert.deepEqual(jumpTarget(list, 1), { page: 1, id: 'x0' })
  assert.deepEqual(jumpTarget(list, 51), { page: 2, id: 'x50' })
  assert.deepEqual(jumpTarget(list, '120'), { page: 3, id: 'x119' })
  assert.equal(jumpTarget(list, 999), null)
  assert.equal(jumpTarget(null, 1), null)
})
