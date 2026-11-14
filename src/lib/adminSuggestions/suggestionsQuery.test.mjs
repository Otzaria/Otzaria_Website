import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSuggestionsQuery, serializeSuggestionsQuery, updateSuggestionsQuery, clearFilters, activeFilterCount,
  bookName, filterSuggestions, filterOptions, sanitizeSuggestionsQuery, paginate, pendingParts, partiallyHandled, openInBookHref, isFindReplace, suggestionBookName, partsTruncated, filterSummary,
  SUGGESTIONS_PER_PAGE,
} from './suggestionsQuery.js'

const E = [
  { _id: 'a', book: 'b1', bookPath: 'תנך/בראשית.txt', author: 'u1', authorName: 'משה', kind: 'manual', createdAt: '2026-11-01T10:00:00Z', changes: [{ before: 'x', after: 'y' }] },
  { _id: 'b', book: 'b2', bookPath: 'משנה/ברכות.txt', author: 'u2', authorName: 'אברהם', kind: 'find-replace', createdAt: '2026-11-03T10:00:00Z', changes: [] },
  { _id: 'c', book: 'b1', bookPath: 'תנך/בראשית.txt', author: 'u1', authorName: 'משה', kind: 'manual', createdAt: '2026-11-02T10:00:00Z', changes: [] },
  { _id: 'd', book: 'b3', bookPath: 'אחר/בראשית.txt', author: 'u3', authorName: 'משה', kind: 'manual', createdAt: '2026-10-01T10:00:00Z', changes: [] },
]

test('קריאת הכתובת: ערכים לא מוכרים נזרקים, ברירות מחדל', () => {
  assert.deepEqual(parseSuggestionsQuery(new URLSearchParams('')), { book: '', author: '', kind: '', sort: 'newest', page: 1 })
  assert.deepEqual(parseSuggestionsQuery(new URLSearchParams('book=תנך/בראשית.txt&author=u1&kind=find-replace&sort=oldest&page=3')),
    { book: 'תנך/בראשית.txt', author: 'u1', kind: 'find-replace', sort: 'oldest', page: 3 })
  assert.deepEqual(parseSuggestionsQuery({ kind: 'x', sort: 'y', page: '-2', author: 'a b' }), { book: '', author: '', kind: '', sort: 'newest', page: 1 })
  assert.equal(parseSuggestionsQuery(null).page, 1)
})

test('כתיבת הכתובת: בלי ברירות מחדל, בסדר קבוע, הלוך-חזור', () => {
  assert.equal(serializeSuggestionsQuery({ book: '', author: '', kind: '', sort: 'newest', page: 1 }), '')
  const q = { book: 'תנך/בראשית.txt', author: 'u1', kind: 'manual', sort: 'oldest', page: 2 }
  assert.deepEqual(parseSuggestionsQuery(new URLSearchParams(serializeSuggestionsQuery(q).slice(1))), q)
  assert.equal(serializeSuggestionsQuery({ kind: 'manual', page: 2 }), '?kind=manual&page=2')
})

test('שינוי סינון מחזיר לעמוד הראשון; שינוי עמוד נשמר; ניקוי', () => {
  const q = { book: 'x', author: 'u1', kind: 'manual', sort: 'oldest', page: 4 }
  assert.equal(updateSuggestionsQuery(q, { kind: '' }).page, 1)
  assert.equal(updateSuggestionsQuery(q, { page: 2 }).page, 2)
  assert.equal(activeFilterCount(q), 3)
  assert.deepEqual(clearFilters(q), { book: '', author: '', kind: '', sort: 'oldest', page: 1 })
  assert.equal(activeFilterCount(clearFilters(q)), 0)
})

test('שם ספר מתוך הנתיב', () => {
  assert.equal(bookName('תנך/בראשית.txt'), 'בראשית')
  assert.equal(bookName('הלכה/משנה ברורה/חלק א.txt'), 'משנה ברורה/חלק א')
  assert.equal(bookName('בלי-תיקייה.txt'), 'בלי-תיקייה.txt')
  assert.equal(bookName(undefined), '')
})

test('סינון לפי ספר (נתיב מלא), מציע (מזהה) וסוג; מיון לפי זמן', () => {
  const base = { book: '', author: '', kind: '', sort: 'newest', page: 1 }
  assert.deepEqual(filterSuggestions(E, base).map((e) => e._id), ['b', 'c', 'a', 'd'])
  assert.deepEqual(filterSuggestions(E, { ...base, sort: 'oldest' }).map((e) => e._id), ['d', 'a', 'c', 'b'])
  assert.deepEqual(filterSuggestions(E, { ...base, book: 'תנך/בראשית.txt' }).map((e) => e._id), ['c', 'a'])
  assert.deepEqual(filterSuggestions(E, { ...base, author: 'u3' }).map((e) => e._id), ['d'])
  assert.deepEqual(filterSuggestions(E, { ...base, kind: 'find-replace' }).map((e) => e._id), ['b'])
  assert.equal(E[0]._id, 'a', 'לא משנה את המקור')
})

test('אפשרויות הבוררים: מונים, א"ב, ורמז לקטגוריה כשיש שני ספרים באותו שם', () => {
  const { books, authors, kinds } = filterOptions(E)
  assert.deepEqual(books.map((b) => [b.label, b.count, b.hint]), [['בראשית', 2, 'תנך'], ['בראשית', 1, 'אחר'], ['ברכות', 1, undefined]])
  assert.deepEqual(authors.map((a) => [a.value, a.label, a.count]), [['u2', 'אברהם', 1], ['u1', 'משה', 2], ['u3', 'משה', 1]])
  assert.deepEqual(kinds.map((k) => [k.value, k.label, k.count]), [['manual', 'עריכה ידנית', 3], ['find-replace', 'חיפוש והחלפה', 1]])
})

test('סינון לערך שכבר לא ברשימה נזרק', () => {
  const q = { book: 'גמרא/שבת.txt', author: 'u9', kind: 'manual', sort: 'newest', page: 1 }
  assert.deepEqual(sanitizeSuggestionsQuery(q, E), { ...q, book: '', author: '' })
  assert.equal(sanitizeSuggestionsQuery(q, null), q)
})

test('עימוד', () => {
  const list = Array.from({ length: 45 }, (_, i) => i)
  const p = paginate(list, 3)
  assert.equal(SUGGESTIONS_PER_PAGE, 20)
  assert.deepEqual([p.page, p.pageCount, p.from, p.to, p.items.length], [3, 3, 41, 45, 5])
  assert.equal(paginate(list, 99).page, 3)
})

test('חלקים ממתינים, וטיפול חלקי', () => {
  const edit = { changes: [{ status: 'approved' }, { status: 'pending' }, {}] }
  assert.equal(pendingParts(edit), 2)
  assert.equal(partiallyHandled(edit), true)
  assert.equal(partiallyHandled({ changes: [{}, {}] }), false)
  assert.equal(partiallyHandled({ changes: [{ status: 'rejected' }] }), false)
})

test('"פתח בספר": העורך, ממוקד בחלק הממתין הראשון שיש בו טקסט', () => {
  assert.equal(openInBookHref({ book: 'b1', changes: [{ status: 'approved', before: 'אאא' }, { before: '', after: 'חדש' }, { before: 'שורה א\nשורה ב' }] }),
    `/library/dicta-edit/b1?find=${encodeURIComponent('שורה א')}`)
  assert.equal(openInBookHref({ book: 'b1', changes: [{ before: '  ', after: 'x' }] }), '/library/dicta-edit/b1')
  assert.equal(openInBookHref({ book: 'b1' }), '/library/dicta-edit/b1')
})

test('חיפוש והחלפה — לפי הסוג ו-find; הצעה ידנית כמו שהמסד מחזיר אותה (findReplace מלא ב-null) אינה כזו', () => {
  // כך נראית הצעה ידנית ב-GET: findReplace הוא אובייקט עם ברירות מחדל (models/BookEdit.js)
  const manual = { kind: 'manual', findReplace: { find: null, replace: null, isRegex: false, scope: 'book' } }
  assert.equal(isFindReplace(manual), false)
  assert.equal(isFindReplace({ kind: 'manual' }), false)
  assert.equal(isFindReplace({ kind: 'find-replace', findReplace: { find: '', replace: 'א' } }), false)
  assert.equal(isFindReplace({ kind: 'find-replace', findReplace: { find: 'שרש', replace: '' } }), true)
  assert.equal(isFindReplace({ kind: 'find-replace' }), false)
})

test('שם הספר בהצעה: בלי נתיב — "ספר בלי שם"', () => {
  assert.equal(suggestionBookName({ bookPath: 'תנך/בראשית.txt' }), 'בראשית')
  assert.equal(suggestionBookName({ bookPath: '' }), 'ספר בלי שם')
  assert.equal(suggestionBookName({}), 'ספר בלי שם')
})

test('יותר מ-50 חלקים — השרת חותך, ו-partsTruncated אומר את זה', () => {
  assert.equal(partsTruncated({ changeCount: 80, changes: Array.from({ length: 50 }, () => ({})) }), true)
  assert.equal(partsTruncated({ changeCount: 3, changes: [{}, {}, {}] }), false)
  assert.equal(partsTruncated({ changes: [] }), false)
})

test('סיכום הסינון במילים', () => {
  const options = { books: [{ value: 'תנך/בראשית.txt', label: 'בראשית' }], authors: [{ value: 'u1', label: 'ישראל' }], kinds: [{ value: 'manual', label: 'עריכה ידנית' }] }
  assert.deepEqual(filterSummary({ book: 'תנך/בראשית.txt', author: '', kind: 'manual' }, options), ['בראשית', 'עריכה ידנית'])
  assert.deepEqual(filterSummary({ book: '', author: '', kind: '' }, options), [])
})
