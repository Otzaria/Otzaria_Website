import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activeFilters, decisionEdit, finalVersionLine, trimContext,
  PAGE_SIZE, bookOptions, cardKeyAction, countsAfter, decideUrl, decisionBody, editorHref, errorCardState,
  itemsAfterDecision, listUrl, matchesStatus, messageCardState, normalizeCounts, parsePageReportsQuery, serializePageReportsQuery,
  serverPage, statusCount, tabHref, updatePageReportsQuery,
} from './pageReportsQuery.js'

const q = (s) => parsePageReportsQuery(new URLSearchParams(s))

test('כתובת: ברירות מחדל, וערכים לא מוכרים חוזרים לברירת המחדל', () => {
  assert.deepEqual(q(''), { kind: 'book_error', status: 'pending', book: '', page: 1 })
  assert.deepEqual(q('kind=message&status=handled&book=abc&page=3'), { kind: 'message', status: 'handled', book: 'abc', page: 3 })
  // "אושר" אינו מצב של הודעה
  assert.equal(q('kind=message&status=approved').status, 'pending')
  assert.equal(q('kind=xxx').kind, 'book_error')
  assert.equal(q('page=-2').page, 1)
  assert.equal(q('page=abc').page, 1)
  assert.deepEqual(parsePageReportsQuery(null), { kind: 'book_error', status: 'pending', book: '', page: 1 })
})

test('כתובת: רק מה שאינו ברירת מחדל, וחזרה הלוך ושוב', () => {
  assert.equal(serializePageReportsQuery({ kind: 'book_error', status: 'pending', book: '', page: 1 }), '')
  const s = serializePageReportsQuery({ kind: 'message', status: 'all', book: 'ספר א', page: 2 })
  assert.deepEqual(q(s.slice(1)), { kind: 'message', status: 'all', book: 'ספר א', page: 2 })
})

test('שינוי: חזרה לעמוד הראשון; מעבר לשונית מחזיר ל"ממתין" ושומר את הספר', () => {
  const base = { kind: 'book_error', status: 'approved', book: 'b', page: 4 }
  assert.deepEqual(updatePageReportsQuery(base, { status: 'rejected' }), { ...base, status: 'rejected', page: 1 })
  assert.deepEqual(updatePageReportsQuery(base, { page: 2 }), { ...base, page: 2 })
  assert.deepEqual(updatePageReportsQuery(base, { kind: 'message' }), { kind: 'message', status: 'pending', book: 'b', page: 1 })
  assert.equal(tabHref('/library/admin/page-reports', base, 'message'), '/library/admin/page-reports?kind=message&book=b')
})

test('בקשת הרשימה: סוג, מצב, ספר, skip ו-limit', () => {
  assert.equal(listUrl({ kind: 'book_error', status: 'pending', book: '', page: 1 }), `/api/admin/page-reports?kind=book_error&status=pending&skip=0&limit=${PAGE_SIZE}`)
  assert.equal(listUrl({ kind: 'message', status: 'all', book: 'א ב', page: 3 }), `/api/admin/page-reports?kind=message&status=all&book=%D7%90+%D7%91&skip=${2 * PAGE_SIZE}&limit=${PAGE_SIZE}`)
  assert.equal(decideUrl('a/b'), '/api/admin/page-reports/a%2Fb')
})

test('גוף ההכרעה', () => {
  assert.deepEqual(decisionBody('approve'), { action: 'approve' })
  assert.deepEqual(decisionBody('approve', { applyToText: true, note: '  טוב ' }), { action: 'approve', note: 'טוב' })
  assert.deepEqual(decisionBody('reject', { applyToText: true }), { action: 'reject' })
  assert.deepEqual(decisionBody('apply', { applyToText: true, note: 'x' }), { action: 'apply' })
  assert.deepEqual(decisionBody('reopen', { note: 'x' }), { action: 'reopen' })
  assert.deepEqual(decisionBody('handled', { note: 'טופל', applyToText: true }), { action: 'handled', note: 'טופל' })
})

test('מונים: צורה מלאה, "הכול" הוא סכום, ומעבר בין מצבים', () => {
  const counts = normalizeCounts({ book_error: { pending: 3, approved: 1 }, message: { pending: '2' } })
  assert.deepEqual(counts, { book_error: { pending: 3, approved: 1, rejected: 0 }, message: { pending: 2, handled: 0 } })
  assert.equal(statusCount(counts, 'book_error', 'all'), 4)
  assert.equal(statusCount(counts, 'message', 'pending'), 2)
  assert.equal(statusCount(null, 'message', 'pending'), 0)
  const after = countsAfter(counts, 'book_error', 'pending', 'approved')
  assert.deepEqual(after.book_error, { pending: 2, approved: 2, rejected: 0 })
  assert.equal(countsAfter(counts, 'book_error', 'pending', 'pending'), counts)
  assert.deepEqual(countsAfter(normalizeCounts({}), 'message', 'pending', 'handled').message, { pending: 0, handled: 1 })
})

test('אחרי הכרעה: יוצא מהסינון שלא מתאים, נשאר (מעודכן) בסינון שמתאים', () => {
  const items = [{ _id: '1', status: 'pending' }, { _id: '2', status: 'pending' }]
  const approved = { _id: '1', status: 'approved' }
  assert.deepEqual(itemsAfterDecision(items, approved, 'pending'), { items: [{ _id: '2', status: 'pending' }], removed: true })
  assert.deepEqual(itemsAfterDecision(items, approved, 'all'), { items: [approved, items[1]], removed: false })
  assert.equal(matchesStatus({ status: 'handled' }, 'handled'), true)
  assert.equal(matchesStatus({ status: 'handled' }, 'pending'), false)
})

test('עימוד מהשרת', () => {
  assert.deepEqual(serverPage(1, 0, 0), { page: 1, pageCount: 1, from: 0, to: 0, total: 0 })
  assert.deepEqual(serverPage(2, 75, 30), { page: 2, pageCount: 3, from: 31, to: 60, total: 75 })
  assert.deepEqual(serverPage(3, 75, 15), { page: 3, pageCount: 3, from: 61, to: 75, total: 75 })
  assert.equal(serverPage(9, 75, 0).page, 3)
})

test('כרטיס הודעה', () => {
  assert.deepEqual(messageCardState({ status: 'pending' }), { handle: true, reopen: false })
  assert.deepEqual(messageCardState({ status: 'handled' }), { handle: false, reopen: true })
})

test('קישור לעורך', () => {
  assert.equal(editorHref('בראשית רבה', 12), `/library/books/${encodeURIComponent('בראשית רבה')}/12`)
  assert.equal(editorHref('sefer', 3, 'abc123'), '/library/books/sefer/3?report=abc123')
  assert.equal(editorHref('sefer', 3, null), '/library/books/sefer/3')
})

test('ספרים לבורר: מצטברים, ממוינים, והספר שבכתובת תמיד בפנים', () => {
  const first = bookOptions(new Map(), [{ bookPath: 'b', bookName: 'בית' }, { bookPath: 'a', bookName: 'אלף' }, { bookPath: 'b', bookName: 'בית' }])
  assert.deepEqual(first.options, [{ value: 'a', label: 'אלף' }, { value: 'b', label: 'בית' }])
  const second = bookOptions(first.seen, [{ bookPath: 'c', bookName: 'גימל' }], 'zzz')
  assert.deepEqual(second.options.map((o) => o.value), ['a', 'b', 'c', 'zzz'])
  // הספר שבכתובת קיבל שם כשנטען דיווח שלו
  assert.equal(bookOptions(second.seen, [{ bookPath: 'zzz', bookName: 'דלת' }]).options.find((o) => o.value === 'zzz').label, 'דלת')
})

test('מקשים בכרטיס', () => {
  assert.equal(cardKeyAction({ code: 'KeyA', key: 'a' }), 'approve')
  assert.equal(cardKeyAction({ code: 'KeyR', key: 'ר' }), 'reject')
  assert.equal(cardKeyAction({ key: 'ArrowDown' }), 'next')
  assert.equal(cardKeyAction({ code: 'KeyK' }), 'prev')
  assert.equal(cardKeyAction({ code: 'KeyA', ctrlKey: true }), null)
  assert.equal(cardKeyAction({ code: 'KeyX' }), null)
})

test('trimContext: קיצור מהצד הרחוק, בגבול מילה', () => {
  assert.deepEqual(trimContext('קצר ', ' גם', 10), { before: 'קצר ', after: ' גם' })
  assert.deepEqual(trimContext('אחת שתיים שלוש ארבע ', ' חמש שש שבע שמונה', 12), { before: '…שלוש ארבע ', after: ' חמש שש שבע…' })
  assert.deepEqual(trimContext(null, undefined), { before: '', after: '' })
})

test('activeFilters: מצב שאינו "ממתין" וספר נספרים; "נקה" מחזיר לברירת המחדל', () => {
  assert.deepEqual(activeFilters({ status: 'pending', book: '' }, 'ממתין', ''), { count: 0, summary: [], clearPatch: { status: 'pending', book: '' } })
  const f = activeFilters({ status: 'approved', book: 'qa' }, 'אושר', 'ספר בדיקה')
  assert.equal(f.count, 2)
  assert.deepEqual(f.summary, ['אושר', 'ספר בדיקה'])
})

test('decisionBody: נוסח המנהל רק באישור; applyMode marker רק ב-apply', () => {
  const edit = { original: 'א', proposed: 'ב' }
  assert.deepEqual(decisionBody('approve', { edit }), { action: 'approve', original: 'א', proposed: 'ב' })
  assert.deepEqual(decisionBody('reject', { edit }), { action: 'reject' })
  assert.deepEqual(decisionBody('apply', { applyMode: 'marker' }), { action: 'apply' })
})

test('decisionEdit / finalVersionLine', () => {
  const r = { original: 'בראשת', proposed: 'בראשית' }
  assert.equal(decisionEdit(r, null), null)
  assert.equal(decisionEdit(r, { original: 'בראשת', proposed: 'בראשית' }), null)
  assert.deepEqual(decisionEdit(r, { original: 'בראשת', proposed: 'ברשית' }), { original: 'בראשת', proposed: 'ברשית' })
  assert.equal(finalVersionLine(r), null)
  assert.deepEqual(finalVersionLine({ ...r, finalOriginal: 'בראשת', finalProposed: 'ברשית' }), { reported: '(בראשת) [בראשית]', decided: '(בראשת) [ברשית]' })
})


test('כרטיס מאפשר הכרעה או פתיחה מחדש ללא החלה', () => {
  assert.deepEqual(errorCardState({status:'pending'}), { pending:true, decide:true, reopen:false, applied:false })
  assert.deepEqual(errorCardState({status:'approved'}), { pending:false, decide:false, reopen:true, applied:false })
})
