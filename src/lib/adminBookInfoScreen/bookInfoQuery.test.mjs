import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  attentionCount, changeSetsUrl, checkedFields, dropFields, filterChangeSets, hasNoChange, isStuck, isUnchangedField, matchesSearch,
  mergeRows, parseBookInfoQuery, selectionsFor, serializeBookInfoQuery, statusId, statusOptions, toggleField, toggleRows, withFailed,
} from './bookInfoQuery.js'

const ROWS = [
  { id: '1', book: 'מסילת ישרים', author: 'רמח"ל', status: 'open', submittedBy: 'משה כהן' },
  { id: '2', book: 'חובות הלבבות', author: 'רבנו בחיי', status: 'conflict', submittedBy: 'יעקב לוי' },
  { id: '3', book: 'כוזרי', author: 'ריה"ל', status: 'merged', submittedBy: null },
  { id: '4', book: 'ספר החינוך', author: '', status: 'modified', submittedBy: 'דוד' },
  { id: '5', book: 'שערי תשובה', author: 'רבנו יונה', status: 'mystery', submittedBy: 'דוד' },
]

test('parse / serialize: ברירות מחדל, ערכים לא מוכרים, ובהצעות הישנות — בלי סינון', () => {
  assert.deepEqual(parseBookInfoQuery(new URLSearchParams('')), { view: 'open', status: '', q: '' })
  assert.deepEqual(parseBookInfoQuery(new URLSearchParams('view=all&status=merged&q=כוזרי')), { view: 'all', status: 'merged', q: 'כוזרי' })
  assert.deepEqual(parseBookInfoQuery({ view: 'x', status: 'toString' }), { view: 'open', status: '', q: '' })
  assert.equal(serializeBookInfoQuery({ view: 'open', status: '', q: '' }), '')
  assert.equal(serializeBookInfoQuery({ view: 'all', status: 'closed', q: '' }), '?view=all&status=closed')
  assert.equal(serializeBookInfoQuery({ view: 'legacy', status: 'closed', q: 'x' }), '?view=legacy')
})

test('changeSetsUrl: אותה כתובת כמו המסך הקודם', () => {
  assert.equal(changeSetsUrl('open', null), '/api/admin/book-info/change-sets?active=true')
  assert.equal(changeSetsUrl('all', null), '/api/admin/book-info/change-sets?active=false')
  assert.equal(changeSetsUrl('all', 'eyJ+a/b='), '/api/admin/book-info/change-sets?active=false&cursor=eyJ%2Ba%2Fb%3D')
})

const NOW = Date.parse('2026-11-01T12:00:00Z')

test('סינון וחיפוש: מצב, ספר, מחבר ומציע', () => {
  assert.deepEqual(filterChangeSets(ROWS, { status: 'conflict', q: '' }, NOW).map((r) => r.id), ['2'])
  // "דורש טיפול" — בלי "נכשל" (אין בקשה לטפל בה)
  assert.deepEqual(filterChangeSets(ROWS, { status: 'attention', q: '' }, NOW).map((r) => r.id), ['2', '4'])
  assert.equal(parseBookInfoQuery(new URLSearchParams('status=attention')).status, 'attention')
  assert.equal(parseBookInfoQuery(new URLSearchParams('status=stuck')).status, 'stuck')
  assert.deepEqual(filterChangeSets(ROWS, { status: '', q: 'רבנו' }, NOW).map((r) => r.id), ['2', '5'])
  assert.equal(matchesSearch(ROWS[0], 'משה'), true)
  assert.equal(matchesSearch(ROWS[2], 'משה'), false)
})

test('statusOptions: רק מה שיש, לפי הסדר (מה שדורש טיפול — קודם), מצב לא מוכר — "נכשל"', () => {
  assert.deepEqual(statusOptions(ROWS, NOW), [
    { value: 'attention', label: 'כל מה שדורש טיפול', count: 2 },
    { value: 'conflict', label: 'דורש בדיקה', count: 1 },
    { value: 'modified', label: 'נערך ב‑GitHub', count: 1 },
    { value: 'failed', label: 'נכשל', count: 1 },
    { value: 'open', label: 'ממתין לפרסום', count: 1 },
    { value: 'merged', label: 'פורסם', count: 1 },
  ])
  assert.equal(attentionCount(ROWS, NOW), 2)
  // מצב אחד שדורש טיפול — בלי קבוצה כפולה
  assert.equal(statusOptions(ROWS.slice(0, 3), NOW)[0].value, 'conflict')
})

test('"בפתיחה" יותר מרבע שעה — תקוע, ונספר כדורש טיפול', () => {
  const fresh = { id: 'f', status: 'publishing', createdAt: new Date(NOW - 60 * 1000).toISOString() }
  const old = { id: 'o', status: 'publishing', createdAt: new Date(NOW - 60 * 60 * 1000).toISOString() }
  assert.equal(isStuck(fresh, NOW), false)
  assert.equal(isStuck(old, NOW), true)
  assert.equal(statusId(old, NOW), 'stuck')
  assert.equal(statusId({ status: 'stuck' }, NOW), 'failed')
  assert.equal(attentionCount([fresh, old], NOW), 1)
})

test('"פתוחות" עם מה שנכשל, ו"טען עוד" — בלי כפילות ומהחדשה לישנה', () => {
  const active = [{ id: 'a', status: 'open', createdAt: '2026-10-03' }]
  const recent = [
    { id: 'a', status: 'open', createdAt: '2026-10-03' },
    { id: 'b', status: 'failed', createdAt: '2026-10-05' },
    { id: 'c', status: 'merged', createdAt: '2026-10-04' },
  ]
  assert.deepEqual(withFailed(active, recent, NOW).map((r) => r.id), ['b', 'a'])
  assert.deepEqual(mergeRows([{ id: 'x', createdAt: '2026-10-02' }], [{ id: 'x', createdAt: '2026-10-02' }, { id: 'y', createdAt: '2026-10-01' }]).map((r) => r.id), ['x', 'y'])
})

test('הצעות ישנות: בהתחלה אין סימון; סימון שדה, בחירת הצעה, מה נשלח, ומה נשאר', () => {
  const legacy = [
    { id: 'a', changedFields: ['authorName', 'startYear'] },
    { id: 'b', changedFields: ['bookName'] },
  ]
  let sel = {}
  assert.deepEqual(selectionsFor(legacy, sel), [])
  sel = toggleField(sel, legacy[0], 'startYear', true)
  assert.deepEqual(selectionsFor(legacy, sel), [{ changeId: 'a', fields: ['startYear'] }])
  sel = toggleField(sel, legacy[0], 'authorName', true)
  // הסדר — לפי ההצעה, לא לפי סדר הסימון
  assert.deepEqual(checkedFields(sel, legacy[0]), ['authorName', 'startYear'])
  // ביטול השדה האחרון — ההצעה יוצאת מהבחירה (לא נשלח fields ריק, שבשרת פירושו "הכול")
  sel = toggleField(toggleField(sel, legacy[0], 'authorName', false), legacy[0], 'startYear', false)
  assert.deepEqual(sel, {})
  sel = toggleRows(sel, legacy, true)
  assert.deepEqual(selectionsFor(legacy, sel), [{ changeId: 'a', fields: ['authorName', 'startYear'] }, { changeId: 'b', fields: ['bookName'] }])
  assert.deepEqual(toggleRows(sel, [legacy[1]], false), { a: ['authorName', 'startYear'] })
  assert.deepEqual(dropFields(legacy[0], ['startYear']), { id: 'a', changedFields: ['authorName'] })
  assert.equal(dropFields(legacy[1], ['bookName']), null)
})

test('הצעות ישנות: שדה בלי שינוי, והצעה בלי שום שינוי', () => {
  const row = { approved: { bookName: 'כוזרי', startYear: 1075, authorName: '' }, changes: { bookName: 'הכוזרי', startYear: '1075', authorName: null }, changedFields: ['bookName', 'startYear', 'authorName'] }
  assert.equal(isUnchangedField(row, 'bookName'), false)
  assert.equal(isUnchangedField(row, 'startYear'), true)
  assert.equal(isUnchangedField(row, 'authorName'), true)
  assert.equal(hasNoChange(row), false)
  assert.equal(hasNoChange({ ...row, changedFields: ['startYear', 'authorName'] }), true)
})
