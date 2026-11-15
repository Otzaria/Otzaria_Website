/** בדיקות לצורות התשובה ולפרמטרי הרשימה של דיווחי העמודים (shapes.js). הרצה: npm run test:node */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildErrorMarker } from './rules.js'
import {
  adminReportShape, myReportShape, parseAdminListQuery, countsFromRows, applyModeFor, pageImageUrl, markerPresentIn,
  ADMIN_LIST_MAX_LIMIT,
} from './shapes.js'

const report = {
  _id: 'r1', kind: 'book_error', bookPath: 'sefer', bookName: 'ספר', pageNumber: 2, userName: 'מעתיק', column: 'content',
  original: 'א', proposed: 'ב', offset: 0, status: 'pending', resolution: null, appliedToText: null, createdAt: new Date(0),
  page: 'p1', user: 'u1',
}
const page = (extra = {}) => ({ status: 'completed', imagePath: '/uploads/books/sefer/page.2.jpg', content: buildErrorMarker('א', 'ב'), ...extra })

test('pageImageUrl — imagePath כמו שהוא (כמו thumbnail בעורך)', () => {
  assert.equal(pageImageUrl(page()), '/uploads/books/sefer/page.2.jpg')
  assert.equal(pageImageUrl(null), null)
})

test('adminReportShape: סימון קיים ועמוד גמור → canApply', () => {
  const s = adminReportShape(report, page())
  assert.equal(s._id, 'r1')
  assert.equal(s.pageStatus, 'completed')
  assert.equal(s.markerPresent, true)
  assert.equal(s.canApply, true)
  assert.equal('user' in s, false)
})

test('adminReportShape: בטיפול / הוחל / אין סימון / עמוד נמחק → אין canApply', () => {
  assert.equal(adminReportShape(report, page({ status: 'in-progress' })).canApply, false)
  assert.equal(adminReportShape({ ...report, appliedToText: 'proposed' }, page()).canApply, false)
  assert.equal(adminReportShape(report, page({ content: 'בלי' })).markerPresent, false)
  const gone = adminReportShape(report, null)
  assert.equal(gone.canApply, false)
  assert.equal(gone.pageStatus, null)
  assert.equal(gone.imageUrl, null)
})

test('markerPresentIn: לפי הטור; הודעה תמיד false', () => {
  assert.equal(markerPresentIn({ ...report, column: 'left' }, page({ leftColumn: buildErrorMarker('א', 'ב'), content: '' })), true)
  assert.equal(markerPresentIn({ ...report, column: 'right' }, page()), false)
  assert.equal(markerPresentIn({ ...report, kind: 'message' }, page()), false)
})

test('myReportShape: בלי פרטי המנהל', () => {
  const s = myReportShape({ ...report, resolution: { note: 'ok', by: 'a1', byName: 'מנהל', at: new Date(1) } })
  assert.deepEqual(s.resolution, { note: 'ok', at: new Date(1) })
  assert.equal('userName' in s, false)
})

test('parseAdminListQuery: ברירות מחדל, תקרה ושגיאות', () => {
  assert.deepEqual(parseAdminListQuery(new URLSearchParams()).value, { kind: 'book_error', status: 'pending', book: null, page: null, skip: 0, limit: 30 })
  assert.equal(parseAdminListQuery(new URLSearchParams('limit=1000')).value.limit, ADMIN_LIST_MAX_LIMIT)
  assert.equal(parseAdminListQuery(new URLSearchParams('kind=message&status=handled')).ok, true)
  assert.equal(parseAdminListQuery(new URLSearchParams('kind=message&status=approved')).ok, false)
  assert.equal(parseAdminListQuery(new URLSearchParams('status=handled')).ok, false)
  assert.equal(parseAdminListQuery(new URLSearchParams('status=all&book=x&page=4')).value.page, 4)
  for (const bad of ['kind=x', 'page=0', 'page=a', 'skip=-1', 'limit=0']) assert.equal(parseAdminListQuery(new URLSearchParams(bad)).ok, false, bad)
})

test('countsFromRows: כל הסטטוסים, גם כשאין שורות', () => {
  assert.deepEqual(countsFromRows([
    { _id: { kind: 'book_error', status: 'pending' }, count: 3 },
    { _id: { kind: 'message', status: 'handled' }, count: 2 },
    { _id: { kind: 'message', status: 'approved' }, count: 9 },
  ]), { book_error: { pending: 3, approved: 0, rejected: 0 }, message: { pending: 0, handled: 2 } })
})

test('applyModeFor', () => {
  assert.equal(applyModeFor('approved'), 'proposed')
  assert.equal(applyModeFor('rejected'), 'original')
  assert.equal(applyModeFor('pending'), null)
})

test('adminReportShape: אזור הצילום — תקין עובר, חסר/פגום → null (דיווחים ישנים)', () => {
  assert.equal(adminReportShape(report, page()).cropRect, null)
  const cropRect = { x: 0.1, y: 0.2, w: 0.8, h: 0.05, source: 'layout', level: 'line', mark: null }
  assert.deepEqual(adminReportShape({ ...report, cropRect }, page()).cropRect, cropRect)
  assert.equal(adminReportShape({ ...report, cropRect: { ...cropRect, w: 2 } }, page()).cropRect, null)
})
