import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bookGroupKey,
  bookScope,
  displayBookName,
  groupBookStatus,
  groupUploaders,
  groupUploadsByBook,
  isPageUpload,
  orderGroupItems,
  parseUploadName,
  uploadItemLabel,
  uploaderKey,
} from './uploadGroups.js'

test('parseUploadName: כל צורות סיומת העמוד', () => {
  assert.deepEqual(parseUploadName('חוות-דעת - עמוד 40'), { base: 'חוות-דעת', page: 40, oldVersion: false })
  assert.deepEqual(parseUploadName('חוות דעת_page_96'), { base: 'חוות דעת', page: 96, oldVersion: false })
  assert.deepEqual(parseUploadName('ספר page 5'), { base: 'ספר', page: 5, oldVersion: false })
  assert.deepEqual(parseUploadName('ספר -page 7 '), { base: 'ספר', page: 7, oldVersion: false })
  assert.deepEqual(parseUploadName('ספר עמוד 12'), { base: 'ספר', page: 12, oldVersion: false })
  assert.deepEqual(parseUploadName('ספר – עמוד 3'), { base: 'ספר', page: 3, oldVersion: false })
})

test('parseUploadName: בלי סיומת עמוד — השם כמו שהוא', () => {
  assert.deepEqual(parseUploadName('אסופות ומאמרים'), { base: 'אסופות ומאמרים', page: null, oldVersion: false })
  assert.deepEqual(parseUploadName('תלמוד בבלי/אחרונים/בית מאיר'), { base: 'תלמוד בבלי/אחרונים/בית מאיר', page: null, oldVersion: false })
  // "page" בתוך מילה אינו סיומת עמוד (הביטוי הישן חתך כאן)
  assert.deepEqual(parseUploadName('homepage 5'), { base: 'homepage 5', page: null, oldVersion: false })
  // רק סיומת — לא נשאר שם ריק
  assert.deepEqual(parseUploadName('עמוד 4'), { base: 'עמוד 4', page: null, oldVersion: false })
  assert.deepEqual(parseUploadName(null), { base: '', page: null, oldVersion: false })
  assert.deepEqual(parseUploadName(undefined), { base: '', page: null, oldVersion: false })
})

test('parseUploadName: גרסה ישנה — עם סוגר ובלעדיו, בעמוד ובספר', () => {
  assert.deepEqual(parseUploadName('חוות-דעת - עמוד 48 (גרסה ישנה מ-2026-03-07T23-34-23-037Z'), { base: 'חוות-דעת', page: 48, oldVersion: true })
  assert.deepEqual(parseUploadName('הלכה/אחרונים/מקורי מנהגים (גרסה ישנה מ-2026-05-17T12-58-32-535Z)'), { base: 'הלכה/אחרונים/מקורי מנהגים', page: null, oldVersion: true })
  // סוגריים אחרים בשם נשארים
  assert.deepEqual(parseUploadName('תלמוד בבלי/אחרונים/בקע לגולגלת (שס)'), { base: 'תלמוד בבלי/אחרונים/בקע לגולגלת (שס)', page: null, oldVersion: false })
  assert.equal(uploadItemLabel({ bookName: 'ספר - עמוד 7 (גרסה ישנה מ-2026-03-23T08-55-17-465Z' }), 'עמוד 7 (גרסה ישנה)')
  const groups = groupUploadsByBook([
    { id: '1', bookName: 'ספר - עמוד 7 (גרסה ישנה מ-2026-03-23T08-55-17-465Z', uploadedAt: '2026-01-01' },
    { id: '2', bookName: 'ספר - עמוד 8', uploadedAt: '2026-01-02' },
  ])
  assert.equal(groups.length, 1)
})

test('bookGroupKey: מקף/רווח/קו תחתון וגרשיים לא משנים', () => {
  assert.equal(bookGroupKey('חוות-דעת'), bookGroupKey('חוות דעת'))
  assert.equal(bookGroupKey('ריטב״א-ב״ב'), bookGroupKey('ריטבא בב'))
  assert.notEqual(bookGroupKey('חוות דעת'), bookGroupKey('נתיבות המשפט'))
  assert.equal(bookGroupKey(''), '')
})

test('displayBookName: שם בכתובת, נתיב דיקטה, ספר אישי', () => {
  assert.deepEqual(displayBookName('ריטב״א-ב״ב-יש-נוחלין'), { title: 'ריטב״א ב״ב יש נוחלין', location: null, personal: false })
  assert.deepEqual(displayBookName('תלמוד בבלי/אחרונים/בית מאיר שס'), { title: 'בית מאיר שס', location: 'תלמוד בבלי › אחרונים', personal: false })
  assert.deepEqual(displayBookName('u-0341-יעבץ-על-תהילים'), { title: 'יעבץ על תהילים', location: null, personal: true })
  // שם עם רווחים — המקפים בו נשארים
  assert.deepEqual(displayBookName('רבינו יונה על משלי -השלמה!'), { title: 'רבינו יונה על משלי -השלמה!', location: null, personal: false })
  assert.equal(displayBookName('').title, 'ללא שם')
  // "/" בשם שאינו נתיב (לא מדיקטה) — חלק מהשם
  assert.deepEqual(displayBookName('<b>html</b> & script', { path: false }), { title: '<b>html</b> & script', location: null, personal: false })
})

test('groupUploadsByBook: "/" מתפרק לנתיב רק בספר מדיקטה; searchText מנורמל', () => {
  const [plain] = groupUploadsByBook([{ id: 'a', bookName: 'שו"ת א/ב', uploadedAt: '2026-01-01' }])
  assert.equal(plain.title, 'שו"ת א/ב')
  assert.equal(plain.location, null)
  const [dicta] = groupUploadsByBook([{ id: 'b', bookName: 'תלמוד בבלי/בית מאיר', uploadedAt: '2026-01-01', uploadType: 'dicta' }])
  assert.equal(dicta.title, 'בית מאיר')
  assert.equal(dicta.searchText, 'בית מאיר תלמוד בבלי')
})

test('bookScope, isPageUpload ו-orderGroupItems', () => {
  const list = [
    { bookName: 'חוות-דעת - עמוד 40' }, { bookName: 'חוות דעת - עמוד 3' }, { bookName: 'חוות דעת - עמוד 12 (גרסה ישנה מ-2026)' },
    { bookName: 'חוות דעת - עמוד 12' },
  ]
  assert.deepEqual(bookScope(list), { books: 1, uploads: 4, title: 'חוות דעת' })
  assert.deepEqual(bookScope([...list, { bookName: 'נתיבות' }]), { books: 2, uploads: 5, title: null })
  assert.equal(isPageUpload(list[0]), true)
  assert.equal(isPageUpload({ bookName: 'נתיבות' }), false)
  assert.deepEqual(orderGroupItems(list).map((u) => u.bookName), [
    'חוות דעת - עמוד 3', 'חוות דעת - עמוד 12', 'חוות דעת - עמוד 12 (גרסה ישנה מ-2026)', 'חוות-דעת - עמוד 40',
  ])
  const mixed = [{ bookName: 'א - עמוד 2' }, { bookName: 'א' }]
  assert.equal(orderGroupItems(mixed), mixed)
})

const up = (id, bookName, uploadedAt, extra = {}) => ({ id, bookName, uploadedAt, ...extra })

test('groupUploadsByBook: מקבץ וריאציות של אותו ספר, ממיין מהחדש לישן', () => {
  const groups = groupUploadsByBook([
    up('1', 'חוות-דעת - עמוד 40', '2025-01-01'),
    up('2', 'חוות דעת_page_96', '2025-03-01'),
    up('3', 'נתיבות - עמוד 1', '2025-02-01'),
    up('4', 'חוות-דעת - עמוד 41', '2025-02-15'),
  ])
  assert.deepEqual(groups.map((g) => g.uploads.map((u) => u.id)), [['2', '4', '1'], ['3']])
  // השם לתצוגה — מההעלאה החדשה ביותר
  assert.equal(groups[0].title, 'חוות דעת')
  assert.equal(groups[0].latest, new Date('2025-03-01').getTime())
  assert.equal(groups[0].earliest, new Date('2025-01-01').getTime())
})

test('groupUploadsByBook: אשפה — לפי תאריך המחיקה; ריק וקלט חסר', () => {
  const groups = groupUploadsByBook([
    up('a', 'ספר א', '2025-01-01', { deletedAt: '2025-05-01' }),
    up('b', 'ספר ב', '2025-04-01', { deletedAt: '2025-04-02' }),
  ], { dateField: 'deletedAt' })
  assert.deepEqual(groups.map((g) => g.uploads[0].id), ['a', 'b'])
  assert.deepEqual(groupUploadsByBook([]), [])
  assert.deepEqual(groupUploadsByBook(undefined), [])
})

test('groupUploadsByBook: תאריך לא תקין לא מפיל את המיון', () => {
  const groups = groupUploadsByBook([up('x', 'א', 'not a date'), up('y', 'ב', '2025-01-01')])
  assert.deepEqual(groups.map((g) => g.uploads[0].id), ['y', 'x'])
})

test('uploadItemLabel: עמוד — מספר העמוד; ספר — שם הקובץ', () => {
  assert.equal(uploadItemLabel({ bookName: 'חוות-דעת - עמוד 40' }), 'עמוד 40')
  assert.equal(uploadItemLabel({ bookName: 'אסופות', originalFileName: 'asufot.txt' }), 'asufot.txt')
  assert.equal(uploadItemLabel({ bookName: 'אסופות-ומאמרים' }), 'אסופות ומאמרים')
})

test('groupBookStatus: מצב אחד, מעורב, וברירת מחדל', () => {
  assert.equal(groupBookStatus([{ bookStatus: 'ready' }, { bookStatus: 'ready' }]), 'ready')
  assert.equal(groupBookStatus([{ bookStatus: 'ready' }, { bookStatus: 'not_checked' }]), null)
  assert.equal(groupBookStatus([{}, { bookStatus: 'not_checked' }]), 'not_checked')
  assert.equal(groupBookStatus([]), 'not_checked')
})

test('groupUploaders ו-uploaderKey', () => {
  const uploads = [
    { uploadedBy: 'משה', uploadedByEmail: 'm@x' },
    { uploadedBy: 'משה', uploadedByEmail: 'm@x' },
    { uploadedBy: 'דוד', uploadedByEmail: 'd@x' },
    {},
  ]
  assert.deepEqual(groupUploaders(uploads), { name: 'משה', email: 'm@x', others: 2 })
  assert.deepEqual(groupUploaders([{}]), { name: 'אורח', email: null, others: 0 })
  assert.equal(uploaderKey({ uploadedBy: 'דוד' }), 'דוד')
  assert.equal(uploaderKey({}), 'אורח')
})
