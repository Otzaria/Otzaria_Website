import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLUGIN_VIEWS, VIEW_LABELS, NO_CATEGORY,
  viewFromParams, viewHref, parsePluginsQuery, serializePluginsQuery, updatePluginsQuery,
  hasActiveFilters, activeFilterCount, clearFilters, sanitizePluginsQuery,
  submissionKind, reviewSource, filterPending, filterStore, categoryAssignments,
  countPendingKinds, countStoreStates, paginate, emptyKind,
} from './pluginsQuery.js'

const params = (s) => new URLSearchParams(s)

test('ארבע תצוגות, ולכל אחת שם', () => {
  assert.deepEqual(PLUGIN_VIEWS, ['pending', 'store', 'layout', 'service'])
  assert.deepEqual(PLUGIN_VIEWS.map((v) => VIEW_LABELS[v]), ['לאישור', 'בחנות', 'סידור החנות', 'תוספי שירות'])
})

test('התצוגה מהכתובת: view, ואחריו tab הישן, וברירת המחדל "לאישור"', () => {
  assert.equal(viewFromParams(params('')), 'pending')
  assert.equal(viewFromParams(params('view=store')), 'store')
  assert.equal(viewFromParams(params('view=service')), 'service')
  assert.equal(viewFromParams(params('view=xyz')), 'pending')
  // כתובות ישנות (הלשוניות של המסך הקודם)
  assert.equal(viewFromParams(params('tab=pending')), 'pending')
  assert.equal(viewFromParams(params('tab=approved')), 'store')
  assert.equal(viewFromParams(params('tab=store')), 'layout')
  assert.equal(viewFromParams(params('tab=service')), 'service')
  // view גובר על tab
  assert.equal(viewFromParams(params('tab=approved&view=layout')), 'layout')
  assert.equal(viewFromParams(null), 'pending')
  assert.equal(viewFromParams({ view: 'store' }), 'store')
})

test('כתובת של תצוגה: "לאישור" — הכתובת הישנה, בלי פרמטר', () => {
  assert.equal(viewHref('pending'), '/library/admin/plugins')
  assert.equal(viewHref('store'), '/library/admin/plugins?view=store')
  assert.equal(viewHref('layout'), '/library/admin/plugins?view=layout')
  assert.equal(viewHref('nope'), '/library/admin/plugins')
})

test('קריאה וכתיבה: ערכי ברירת מחדל לא בכתובת, ערכים לא מוכרים נזרקים', () => {
  const q = parsePluginsQuery(params('view=store&q=%20לוח%20&state=suspended&cat=c1&sort=downloads&page=3&plugin=abc123&pane=ratings'))
  assert.deepEqual(q, { view: 'store', q: 'לוח', kind: '', state: 'suspended', cat: 'c1', sort: 'downloads', page: 3, plugin: 'abc123', pane: 'ratings' })
  assert.equal(serializePluginsQuery(q), '?view=store&q=%D7%9C%D7%95%D7%97&state=suspended&cat=c1&sort=downloads&page=3&plugin=abc123&pane=ratings')

  // סוג שייך רק ל"לאישור", מצב וקטגוריה רק ל"בחנות"
  const pending = parsePluginsQuery(params('kind=update&state=suspended&cat=c1&sort=downloads&pane=xx&plugin=../x'))
  assert.deepEqual(pending, { view: 'pending', q: '', kind: 'update', state: '', cat: '', sort: 'oldest', page: 1, plugin: '', pane: '' })
  assert.equal(serializePluginsQuery(pending), '?kind=update')
  assert.equal(serializePluginsQuery(parsePluginsQuery(params(''))), '')
  assert.equal(serializePluginsQuery(parsePluginsQuery(params('view=store&sort=name&page=1'))), '?view=store')
  assert.equal(parsePluginsQuery(params('page=-4')).page, 1)
})

test('שינוי סינון מחזיר לעמוד הראשון; עמוד ומגירה — לא', () => {
  const q = parsePluginsQuery(params('view=store&page=4'))
  assert.equal(updatePluginsQuery(q, { q: 'x' }).page, 1)
  assert.equal(updatePluginsQuery(q, { page: 2 }).page, 2)
  assert.equal(updatePluginsQuery(q, { plugin: 'p1' }).page, 4)
})

test('מסננים פעילים, מונה וניקוי', () => {
  const q = parsePluginsQuery(params('view=store&q=א&state=active&cat=c1'))
  assert.equal(hasActiveFilters(q), true)
  assert.equal(activeFilterCount(q), 2)
  const cleared = clearFilters(q)
  assert.equal(hasActiveFilters(cleared), false)
  assert.equal(cleared.view, 'store')
})

test('קטגוריה שלא קיימת נזרקת כשהקטגוריות ידועות; "לא משובץ" נשאר', () => {
  const q = parsePluginsQuery(params('view=store&cat=gone'))
  assert.equal(sanitizePluginsQuery(q, { categoryIds: ['c1'] }).cat, '')
  assert.equal(sanitizePluginsQuery(q, { categoryIds: null }).cat, 'gone')
  assert.equal(sanitizePluginsQuery({ ...q, cat: NO_CATEGORY }, { categoryIds: [] }).cat, NO_CATEGORY)
})

const newer = { _id: 'n1', name: 'זמני היום', author: 'משה', lastSubmittedAt: '2026-10-05T10:00:00Z' }
const older = { _id: 'u1', isApproved: true, name: 'לוח שנה', author: 'דוד', lastSubmittedAt: '2026-10-01T10:00:00Z', pendingUpdate: { name: 'לוח שנה עברי', version: '2.0.0', tags: ['תאריכים'] } }

test('סוג ההגשה ומה נבדק', () => {
  assert.equal(submissionKind(newer), 'new')
  assert.equal(submissionKind(older), 'update')
  // הוחזר להמתנה: השרת מוחק הכול, גם כשיש עדכון שממתין — זה לא "עדכון"
  assert.equal(submissionKind({ ...older, isApproved: false }), 'returned')
  assert.equal(submissionKind({ isApproved: false, versions: [{ version: '1' }] }), 'returned')
  assert.equal(submissionKind({ isApproved: false, downloadCount: 3 }), 'returned')
  assert.equal(submissionKind({ isApproved: false, ratingCount: 1 }), 'returned')
  assert.equal(submissionKind({ isApproved: false, versions: [], downloadCount: 0 }), 'new')
  assert.equal(reviewSource(older).name, 'לוח שנה עברי')
  assert.equal(reviewSource(newer), newer)
  assert.deepEqual(reviewSource(null), {})
})

test('תור "לאישור": הוותיק ראשון, חיפוש בשם החדש / במפתח / בתגית, וסינון לפי סוג', () => {
  const base = parsePluginsQuery(params(''))
  assert.deepEqual(filterPending([newer, older], base).map((p) => p._id), ['u1', 'n1'])
  assert.deepEqual(filterPending([newer, older], { ...base, sort: 'newest' }).map((p) => p._id), ['n1', 'u1'])
  assert.deepEqual(filterPending([newer, older], { ...base, q: 'עברי' }).map((p) => p._id), ['u1'])
  assert.deepEqual(filterPending([newer, older], { ...base, q: 'משה' }).map((p) => p._id), ['n1'])
  assert.deepEqual(filterPending([newer, older], { ...base, q: 'תאריכים' }).map((p) => p._id), ['u1'])
  assert.deepEqual(filterPending([newer, older], { ...base, kind: 'new' }).map((p) => p._id), ['n1'])
  assert.deepEqual(countPendingKinds([newer, older, older, { versions: [{}] }]), { new: 1, update: 2, returned: 1 })
})

const store = [
  { _id: 'a', name: 'בית', downloadCount: 5, ratingAvg: 4, ratingCount: 2, updatedAt: '2026-01-01T00:00:00Z' },
  { _id: 'b', name: 'אלף', downloadCount: 50, ratingAvg: 3, ratingCount: 9, updatedAt: '2026-05-01T00:00:00Z', isSuspended: true },
  { _id: 'c', name: 'גימל', downloadCount: 0, ratingAvg: 4, ratingCount: 7, updatedAt: '2026-03-01T00:00:00Z' },
]
const cats = [{ id: 'c1', plugins: [{ id: 'a' }, { id: 'b' }] }, { id: 'c2', plugins: [{ id: 'a' }] }]

test('שיבוצים: לכל תוסף — הקטגוריות שלו', () => {
  const map = categoryAssignments(cats)
  assert.deepEqual(map.get('a'), ['c1', 'c2'])
  assert.deepEqual(map.get('b'), ['c1'])
  assert.equal(map.get('c'), undefined)
  assert.equal(categoryAssignments(null).size, 0)
})

test('"בחנות": מיון, מצב וקטגוריה (כולל "לא משובץ")', () => {
  const q = parsePluginsQuery(params('view=store'))
  const map = categoryAssignments(cats)
  assert.deepEqual(filterStore(store, q, map).map((p) => p._id), ['b', 'a', 'c'])
  assert.deepEqual(filterStore(store, { ...q, sort: 'downloads' }, map).map((p) => p._id), ['b', 'a', 'c'])
  // דירוג שווה — מי שיש לו יותר מדרגים קודם
  assert.deepEqual(filterStore(store, { ...q, sort: 'rating' }, map).map((p) => p._id), ['c', 'a', 'b'])
  assert.deepEqual(filterStore(store, { ...q, sort: 'updated' }, map).map((p) => p._id), ['b', 'c', 'a'])
  assert.deepEqual(filterStore(store, { ...q, state: 'suspended' }, map).map((p) => p._id), ['b'])
  assert.deepEqual(filterStore(store, { ...q, state: 'active' }, map).map((p) => p._id), ['a', 'c'])
  assert.deepEqual(filterStore(store, { ...q, cat: 'c2' }, map).map((p) => p._id), ['a'])
  assert.deepEqual(filterStore(store, { ...q, cat: NO_CATEGORY }, map).map((p) => p._id), ['c'])
  assert.deepEqual(countStoreStates(store), { active: 2, suspended: 1 })
})

test('עימוד ומצב ריק', () => {
  const list = Array.from({ length: 45 }, (_, i) => i)
  const page = paginate(list, 3)
  assert.deepEqual([page.page, page.pageCount, page.from, page.to, page.items.length], [3, 3, 41, 45, 5])
  assert.equal(paginate(list, 99).page, 3)
  assert.equal(emptyKind({ total: 0, shown: 0 }), 'all')
  assert.equal(emptyKind({ total: 4, shown: 0 }), 'filtered')
  assert.equal(emptyKind({ total: 4, shown: 2 }), null)
})
