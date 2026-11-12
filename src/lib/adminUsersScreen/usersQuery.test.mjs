import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseUsersQuery, serializeUsersQuery, updateUsersQuery, activeFilterCount, clearFilters, filterUsers, filterOptions,
  filterSummary, paginate, usersCountText, USERS_PER_PAGE,
} from './usersQuery.js'

const U = [
  { _id: 'a', name: 'משה כהן', email: 'Moshe@Example.com', role: 'admin', points: 10, completedPages: 3, createdAt: '2026-01-01T00:00:00Z' },
  { _id: 'b', name: 'אברהם לוי', email: 'avi@example.com', role: 'user', points: 50, completedPages: 1, isSupervisor: true, createdAt: '2026-03-01T00:00:00Z' },
  { _id: 'c', name: 'דוד פרץ', email: 'david@example.com', role: 'admin_books', points: 5, completedPages: 9, isCorrectionsVolunteer: true, dictaEditBlocked: true, createdAt: '2026-02-01T00:00:00Z' },
  { _id: 'd', name: 'יעקב', email: 'yaakov@example.com', role: 'weird', points: 0, createdAt: '2025-12-01T00:00:00Z' },
]

test('parse: ערכים לא מוכרים נזרקים, ברירות מחדל', () => {
  assert.deepEqual(parseUsersQuery(new URLSearchParams('role=hacker&team=x&sort=bad&page=-3&user=<x>')), { q: '', role: '', team: '', sort: 'newest', page: 1, user: '' })
  assert.deepEqual(parseUsersQuery({ q: ['  כהן '], role: 'admin', team: 'blocked', sort: 'points', page: '4', user: 'abc123' }), { q: 'כהן', role: 'admin', team: 'blocked', sort: 'points', page: 4, user: 'abc123' })
  assert.equal(parseUsersQuery(null).sort, 'newest')
  assert.equal(parseUsersQuery({ q: 'x'.repeat(300) }).q.length, 100)
})

test('serialize: בלי ברירות מחדל, בסדר קבוע, הלוך-חזור', () => {
  assert.equal(serializeUsersQuery({ q: '', role: '', team: '', sort: 'newest', page: 1, user: '' }), '')
  const q = { q: 'כהן', role: 'admin', team: 'supervisor', sort: 'name', page: 2, user: 'a1' }
  const s = serializeUsersQuery(q)
  assert.equal(s.startsWith('?q='), true)
  assert.deepEqual(parseUsersQuery(new URLSearchParams(s.slice(1))), q)
})

test('update: סינון מחזיר לעמוד 1; עמוד ומגירה לא', () => {
  const q = { q: '', role: '', team: '', sort: 'newest', page: 3, user: '' }
  assert.equal(updateUsersQuery(q, { role: 'admin' }).page, 1)
  assert.equal(updateUsersQuery(q, { page: 5 }).page, 5)
  assert.equal(updateUsersQuery(q, { user: 'a' }).page, 3)
  assert.equal(updateUsersQuery(q, { user: 'a', role: 'admin' }).page, 1)
})

test('מונה הסינון וניקוי', () => {
  const q = { q: 'x', role: 'admin', team: '', sort: 'name', page: 2, user: 'a' }
  assert.equal(activeFilterCount(q), 2)
  assert.deepEqual(clearFilters(q), { q: '', role: '', team: '', sort: 'name', page: 1, user: 'a' })
})

test('filter: חיפוש בשם ובדואר, כל המילים, בלי הבדל אותיות', () => {
  const base = { q: '', role: '', team: '', sort: 'newest', page: 1 }
  assert.deepEqual(filterUsers(U, { ...base, q: 'moshe' }).map((u) => u._id), ['a'])
  assert.deepEqual(filterUsers(U, { ...base, q: 'משה example' }).map((u) => u._id), ['a'])
  assert.deepEqual(filterUsers(U, { ...base, q: 'משה לוי' }).map((u) => u._id), [])
})

test('filter: תפקיד (לא מוכר = משתמש) וצוות', () => {
  const base = { q: '', role: '', team: '', sort: 'newest', page: 1 }
  assert.deepEqual(filterUsers(U, { ...base, role: 'user' }).map((u) => u._id), ['b', 'd'])
  assert.deepEqual(filterUsers(U, { ...base, team: 'blocked' }).map((u) => u._id), ['c'])
  assert.deepEqual(filterUsers(U, { ...base, team: 'volunteer' }).map((u) => u._id), ['c'])
  assert.deepEqual(filterUsers(U, { ...base, team: 'supervisor' }).map((u) => u._id), ['b'])
})

test('sort: הצטרפות, שם, נקודות, עמודים', () => {
  const base = { q: '', role: '', team: '', page: 1 }
  assert.deepEqual(filterUsers(U, { ...base, sort: 'newest' }).map((u) => u._id), ['b', 'c', 'a', 'd'])
  assert.deepEqual(filterUsers(U, { ...base, sort: 'oldest' }).map((u) => u._id), ['d', 'a', 'c', 'b'])
  assert.deepEqual(filterUsers(U, { ...base, sort: 'points' }).map((u) => u._id), ['b', 'a', 'c', 'd'])
  assert.deepEqual(filterUsers(U, { ...base, sort: 'pages' }).map((u) => u._id), ['c', 'a', 'b', 'd'])
  assert.deepEqual(filterUsers(U, { ...base, sort: 'name' }).map((u) => u._id), ['b', 'c', 'd', 'a'])
  // לא משנה את המקור
  assert.equal(U[0]._id, 'a')
})

test('אפשרויות: כל התפקידים בסדר קבוע עם מונה, ושלושת הצוותים', () => {
  const { roles, teams } = filterOptions(U)
  assert.equal(roles[0].value, 'user')
  assert.equal(roles.find((r) => r.value === 'user').count, 2)
  assert.equal(roles.find((r) => r.value === 'developer').count, 0)
  assert.deepEqual(teams.map((t) => [t.value, t.count]), [['supervisor', 1], ['volunteer', 1], ['blocked', 1]])
})

test('סיכום, עימוד ומספר', () => {
  assert.deepEqual(filterSummary({ q: 'כהן', role: 'admin_books', team: 'blocked' }), ['"כהן"', 'מנהל ספרים', 'חסום מעריכה'])
  const many = Array.from({ length: 60 }, (_, i) => ({ _id: String(i) }))
  const p = paginate(many, 3)
  assert.equal(USERS_PER_PAGE, 25)
  assert.deepEqual([p.page, p.pageCount, p.from, p.to, p.items.length], [3, 3, 51, 60, 10])
  assert.equal(paginate(many, 99).page, 3)
  assert.equal(usersCountText(1), 'משתמש אחד')
  assert.equal(usersCountText(1200), '1,200 משתמשים')
})
