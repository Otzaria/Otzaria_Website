import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bookOwnership,
  bookProgress,
  bulkPlan,
  bulkProgressText,
  bulkResultText,
  bulkUndoText,
  deleteBookDialog,
  displayCategory,
  downloadFileName,
  emptyStateKind,
  isPersonal,
  normalizeBook,
  progressText,
  safeColor,
  selectedBooksText,
  startedBookText,
  startedBooks,
} from './bookTerms.js'
import { LRI, PDI } from '../adminList/fileSize.js'

const book = (over = {}) => normalizeBook({ id: 'b1', name: 'ספר', totalPages: 10, completedPages: 0, inProgressPages: 0, category: 'כללי', ...over })

test('normalizeBook: אותה צורה מעמוד הניהול ומ-/api/library/list (ownerId מאוכלס, מזהה כאובייקט)', () => {
  const fromList = normalizeBook({ id: { _id: 'abc' }, name: 'א', ownerId: { _id: 'u1', name: 'משה' }, ownerName: 'משה', totalPages: '12', completedPages: -3 })
  assert.equal(fromList.id, 'abc')
  assert.equal(fromList.ownerId, 'u1')
  assert.equal(fromList.ownerName, 'משה')
  assert.equal(fromList.totalPages, 12)
  assert.equal(fromList.completedPages, 0)
  assert.equal(fromList.category, 'כללי')
  const fromPage = normalizeBook({ id: 'abc', ownerId: 'u1', ownerName: 'משה', isHidden: true })
  assert.equal(fromPage.ownerId, 'u1')
  assert.equal(fromPage.isHidden, true)
  assert.equal(normalizeBook({ id: 'x', ownerId: null }).ownerId, null)
})

test('בעלות: ציבורי / אישי (עם שם) / היה אישי; שם מהקטגוריה כשאין ownerName', () => {
  assert.deepEqual(bookOwnership(book()), { kind: 'public', owner: null, label: 'ציבורי' })
  assert.equal(bookOwnership(book({ ownerId: 'u', ownerName: 'משה' })).label, 'אישי · משה')
  assert.equal(bookOwnership(book({ isPrivate: true, category: 'אישי - שפוו' })).label, 'אישי · שפוו')
  assert.equal(bookOwnership(book({ isPrivate: true, category: 'כללי' })).label, 'אישי')
  assert.equal(bookOwnership(book({ originalOwnerId: 'u', originalOwnerName: 'דוד' })).label, 'היה אישי · דוד')
  assert.equal(isPersonal(book({ isPrivate: true })), true)
  assert.equal(isPersonal(book({ originalOwnerId: 'u' })), false)
})

test('קטגוריה להצגה: "אישי - …" אינה קטגוריה', () => {
  assert.equal(displayCategory(book({ category: 'ראשונים' })), 'ראשונים')
  assert.equal(displayCategory(book({ category: 'אישי - משה' })), null)
  assert.equal(displayCategory(normalizeBook({ id: 'x' })), 'כללי')
})

test('התקדמות: עיגול כלפי מטה, שלבים, וחסימה בגבולות', () => {
  assert.deepEqual(bookProgress(book({ totalPages: 340, completedPages: 120, inProgressPages: 5 })), { total: 340, completed: 120, inProgress: 5, available: 215, percent: 35, stage: 'in_progress' })
  assert.equal(bookProgress(book({ totalPages: 1000, completedPages: 999 })).percent, 99)
  assert.equal(bookProgress(book({ totalPages: 10, completedPages: 10 })).stage, 'completed')
  assert.equal(bookProgress(book({ totalPages: 10, completedPages: 0, inProgressPages: 2 })).stage, 'in_progress')
  assert.equal(bookProgress(book({ totalPages: 10 })).stage, 'not_started')
  assert.equal(bookProgress(book({ totalPages: 0 })).stage, 'empty')
  // נתון שגוי מהשרת (יותר שהושלמו מהקיים) — לא יותר מ-100%
  const over = bookProgress({ totalPages: 5, completedPages: 9, inProgressPages: 3 })
  assert.equal(over.completed, 5)
  assert.equal(over.inProgress, 0)
  assert.equal(over.percent, 100)
})

test('ניסוח: התקדמות ומספר נבחרים', () => {
  assert.equal(progressText(bookProgress(book({ totalPages: 1340, completedPages: 120 }))), '120 מתוך 1,340 הושלמו')
  assert.equal(progressText(bookProgress(book({ totalPages: 1, completedPages: 1 }))), '1 מתוך 1 הושלמו')
  assert.equal(progressText(bookProgress(book({ totalPages: 0 }))), 'אין עמודים')
  assert.equal(selectedBooksText(1), 'ספר אחד נבחר')
  assert.equal(selectedBooksText(3), '3 ספרים נבחרו')
})

test('safeColor: רק hex תקין נכנס ל-style', () => {
  assert.equal(safeColor('#FF4013'), '#ff4013')
  assert.equal(safeColor('#abc'), '#abc')
  assert.equal(safeColor('red'), null)
  assert.equal(safeColor('#12345'), null)
  assert.equal(safeColor('#fff;background:url(x)'), null)
  assert.equal(safeColor(undefined), null)
})

test('מצב ריק', () => {
  assert.equal(emptyStateKind({ total: 0, shown: 0 }), 'none')
  assert.equal(emptyStateKind({ total: 5, shown: 0 }), 'no-match')
  assert.equal(emptyStateKind({ total: 5, shown: 2 }), null)
})

test('פעולה מרובה: הסתר — רק מה שעוד גלוי', () => {
  const plan = bulkPlan([book({ id: 'a' }), book({ id: 'b', isHidden: true })], 'hide')
  assert.deepEqual(plan.targets.map((b) => b.id), ['a'])
  assert.equal(plan.unchanged, 1)
})

test('פעולה מרובה: הצג — מוסתרים בלבד, וספר אישי נשאר מוסתר (השרת חוסם)', () => {
  const plan = bulkPlan([
    book({ id: 'a', isHidden: true }),
    book({ id: 'b', isHidden: true, ownerId: 'u' }),
    book({ id: 'c' }),
  ], 'show')
  assert.deepEqual(plan.targets.map((b) => b.id), ['a'])
  assert.equal(plan.personal, 1)
  assert.equal(plan.unchanged, 1)
})

test('פעולה מרובה: קטגוריה — לא לאישיים ולא למי שכבר בה', () => {
  const plan = bulkPlan([
    book({ id: 'a', category: 'ראשונים' }),
    book({ id: 'b', category: 'אחרונים' }),
    book({ id: 'c', isPrivate: true, category: 'אישי - משה' }),
  ], 'category', 'ראשונים')
  assert.deepEqual(plan.targets.map((b) => b.id), ['b'])
  assert.equal(plan.personal, 1)
  assert.equal(plan.unchanged, 1)
})

test('הודעת תוצאה: מה נעשה, מה נכשל ומה דולג ולמה', () => {
  assert.deepEqual(bulkResultText('hide', { done: 3 }), { message: '3 ספרים הוסתרו.', tone: 'success' })
  assert.equal(bulkResultText('show', { done: 1, personal: 2 }).message, 'ספר אחד מוצג עכשיו לכולם. 2 ספרים אישיים נשארו מוסתרים: ספר אישי לא מוצג לכולם.')
  assert.deepEqual(bulkResultText('show', { done: 0, personal: 1 }), { message: 'ספר אישי אחד נשאר מוסתר: ספר אישי לא מוצג לכולם.', tone: 'error' })
  assert.equal(bulkResultText('category', { done: 2, failed: 1, category: 'ראשונים' }).message, '2 ספרים הועברו לקטגוריה "ראשונים". ספר אחד לא עודכן — נסה שוב.')
  assert.equal(bulkResultText('hide', { done: 0, unchanged: 2 }).message, 'כל הספרים שנבחרו כבר מוסתרים.')
  assert.equal(bulkResultText('hide', { done: 120, stopped: 2625 }).message, '120 ספרים הוסתרו. נעצר — 2,625 ספרים לא עודכנו.')
  assert.deepEqual(bulkResultText('hide', { done: 0, busy: 1 }), { message: 'ספר אחד דולג: כבר רצה עליו פעולה אחרת.', tone: 'error' })
  assert.equal(bulkProgressText('hide', { done: 120, total: 2745 }), 'מסתיר… 120 מתוך 2,745')
  assert.deepEqual(bulkUndoText({ done: 3, failed: 0 }), { message: 'השינוי בוטל ב-3 ספרים.', tone: 'success' })
  assert.equal(bulkUndoText({ done: 1, failed: 2 }).message, 'השינוי בוטל בספר אחד. ב-2 ספרים לא הצלחנו לבטל — נסה שוב.')
})

test('מיזוג: אילו ספרים כבר התחילו, ובאיזה ניסוח', () => {
  const started = startedBooks([
    book({ id: 'a', name: 'חוות דעת', totalPages: 100, completedPages: 12, inProgressPages: 3 }),
    book({ id: 'b', name: 'נקי' }),
    book({ id: 'c', name: 'בעבודה', inProgressPages: 1 }),
  ])
  assert.deepEqual(started.map((s) => s.book.id), ['a', 'c'])
  assert.equal(startedBookText(started[0]), 'חוות דעת — 12 עמודים הושלמו, 3 בעבודה')
  assert.equal(startedBookText(started[1]), 'בעבודה — 1 בעבודה')
})

test('מחיקה לצמיתות: הכותרת שאלה קצרה, השם בגוף, ומה יימחק במספרים', () => {
  const d = deleteBookDialog(book({ name: 'חוות דעת', totalPages: 340, completedPages: 120, inProgressPages: 1 }))
  assert.equal(d.title, 'למחוק לצמיתות את הספר?')
  assert.equal(d.bodyAfterName, ' יימחק מהמערכת, ולא יהיה אפשר לשחזר אותו. יימחקו:')
  assert.deepEqual(d.details, ['340 עמודים והתמונות שלהם', 'הטקסט של 120 העמודים שהושלמו', 'העבודה של מי שעובד עכשיו על עמוד אחד', 'הנחיות העריכה של הספר'])
  assert.equal(d.confirmLabel, 'מחק לצמיתות')
})

test('שם קובץ להורדה: בלי תווים אסורים', () => {
  assert.equal(downloadFileName('שו"ת: א/ב', 'טקסט', 'txt'), 'שו ת א ב - טקסט.txt')
  assert.equal(downloadFileName('', '', 'pdf'), 'ספר.pdf')
})

test('הוספת ספר: שם מהקובץ, גודל קריא, ובדיקות כמו בשרת', async () => {
  const { nameFromFile, fileSizeText, newBookErrors, MAX_PDF_BYTES } = await import('./bookTerms.js')
  assert.equal(nameFromFile('חוות_דעת  חלק_א.pdf'), 'חוות דעת חלק א')
  assert.equal(fileSizeText(3.4 * 1024 * 1024), `${LRI}3.4 MB${PDI}`)
  assert.equal(fileSizeText(2 * 1024 * 1024), `${LRI}2 MB${PDI}`)
  assert.equal(fileSizeText(500), `${LRI}500 B${PDI}`)
  assert.deepEqual(newBookErrors({ name: ' ', file: null }), { name: 'כתוב שם לספר.', file: 'בחר קובץ PDF.' })
  assert.deepEqual(newBookErrors({ name: 'א', file: { name: 'a.docx', size: 10, type: 'application/msword' } }), { file: 'הקובץ צריך להיות PDF.' })
  assert.match(newBookErrors({ name: 'א', file: { name: 'a.pdf', size: MAX_PDF_BYTES + 1, type: 'application/pdf' } }).file, /גדול מדי/)
  assert.deepEqual(newBookErrors({ name: 'א', file: { name: 'a.pdf', size: 10, type: 'application/pdf' } }), {})
})

test('הוספת ספר מטווח עמודים: קובץ גדול מ-50MB מותר כשנבחר טווח; החלק שנחתך — עד 50MB', async () => {
  const { newBookErrors, slicedSizeError, uploadRangeSummary, fileSizeText, MAX_PDF_BYTES, MAX_SOURCE_PDF_BYTES } = await import('./bookTerms.js')
  const big = { name: 'a.pdf', size: MAX_PDF_BYTES * 3, type: 'application/pdf' }
  assert.match(newBookErrors({ name: 'א', file: big }).file, /בחר טווח עמודים/)
  assert.deepEqual(newBookErrors({ name: 'א', file: big, partial: true }), {})
  assert.equal(newBookErrors({ name: 'א', file: big, canSlice: false }).file, `הקובץ גדול מדי (${fileSizeText(big.size)}). אפשר עד 50MB.`)
  const huge = { ...big, size: MAX_SOURCE_PDF_BYTES + 1 }
  assert.match(newBookErrors({ name: 'א', file: huge, partial: true }).file, /אפשר עד 500MB/)
  assert.equal(slicedSizeError(MAX_PDF_BYTES), null)
  assert.match(slicedSizeError(MAX_PDF_BYTES + 1), /בחר פחות עמודים/)
  assert.equal(uploadRangeSummary(null, 300), 'יועלו כל 300 העמודים.')
  assert.equal(uploadRangeSummary(null, 1), 'יועלה עמוד אחד — כל הקובץ.')
  assert.equal(uploadRangeSummary({ from: 1, to: 20 }, 300), 'יועלו 20 עמודים (1–20) מתוך 300.')
  assert.equal(uploadRangeSummary({ from: 41, to: 60 }, 300), 'יועלו 20 עמודים (41–60) מתוך 300; בספר הם ימוספרו 1–20.')
  assert.equal(uploadRangeSummary({ from: 7, to: 7 }, 300), 'יועלה עמוד 7 בלבד; בספר הוא יהיה עמוד 1.')
})
