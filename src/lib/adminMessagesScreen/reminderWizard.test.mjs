import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_REMINDER_MESSAGE, bookOptions, editorsFoundText, isUncertainFailure, uncertainConfirm, booksWithWork, canAdvance, duplicateConfirm, isPartialSend, reminderSubject, sendEmailBody,
  sentResultText,
} from './reminderWizard.js'

test('booksWithWork: לא מוסתר, ויש עמודים בעבודה (ספר בלי עבודה — תמיד "אין למי לשלוח", לא מוצג)', () => {
  const books = [
    { path: 'a', inProgressPages: 2, completedPages: 10, totalPages: 10 },
    { path: 'b', inProgressPages: 0, completedPages: 3, totalPages: 10 },
    { path: 'c', inProgressPages: 0, completedPages: 10, totalPages: 10 },
    { path: 'd', inProgressPages: 5, completedPages: 0, totalPages: 10, isHidden: true },
  ]
  assert.deepEqual(booksWithWork(books).map((b) => b.path), ['a'])
  assert.deepEqual(booksWithWork(undefined), [])
})

test('bookOptions: שם, קטגוריה ועמודים בעבודה', () => {
  const [a, b, c] = bookOptions([
    { path: 'a', name: 'ספר א', category: 'הלכה', inProgressPages: 1 },
    { path: 'b', name: 'ספר ב', inProgressPages: 12 },
    { path: 'c', name: 'ספר ג', category: 'מוסר', inProgressPages: 0 },
  ])
  assert.deepEqual(a, { value: 'a', label: 'ספר א', description: 'הלכה · עמוד אחד בעבודה' })
  assert.equal(b.description, '12 עמודים בעבודה')
  assert.equal(c.description, 'מוסר · אין עמודים בעבודה')
})

test('canAdvance לכל שלב', () => {
  assert.equal(canAdvance('book', {}), false)
  assert.equal(canAdvance('book', { bookPath: 'x' }), true)
  assert.equal(canAdvance('recipients', { checking: true, recipients: ['a'] }), false)
  assert.equal(canAdvance('recipients', { recipients: [] }), false)
  assert.equal(canAdvance('recipients', { recipients: ['a'] }), true)
  assert.equal(canAdvance('content', { message: '  ', recipients: ['a'] }), false)
  assert.equal(canAdvance('content', { message: 'שלום', recipients: ['a'] }), true)
  assert.equal(canAdvance('other', {}), false)
})

test('גוף הבקשה ל-send-email — אותם שדות, באותו סדר, ואותו נושא כמו קודם', () => {
  const body = sendEmailBody({ recipients: ['a@x', 'b@x'], bookName: 'ספר', bookPath: 'sefer', message: 'טקסט', html: '<p/>', isPartial: true })
  assert.deepEqual(Object.keys(body), ['bcc', 'subject', 'html', 'text', 'bookName', 'bookPath', 'isPartial'])
  assert.deepEqual(body, { bcc: ['a@x', 'b@x'], subject: 'הודעת מערכת בנוגע לספר "ספר"', html: '<p/>', text: 'טקסט', bookName: 'ספר', bookPath: 'sefer', isPartial: true })
  assert.equal(reminderSubject('x'), 'הודעת מערכת בנוגע לספר "x"')
  assert.match(DEFAULT_REMINDER_MESSAGE, /^שמנו לב כי ישנם עמודים שתפסת לעריכה/)
})

test('isPartialSend: פחות נבחרו ממה שנמצא', () => {
  assert.equal(isPartialSend(['a'], [{}, {}]), true)
  assert.equal(isPartialSend(['a', 'b'], [{}, {}]), false)
  assert.equal(isPartialSend(undefined, undefined), false)
})

test('duplicateConfirm: רק כשהתזכורת האחרונה הייתה על אותו ספר', () => {
  const history = [{ bookName: 'ספר א', timestamp: new Date(Date.now() - 3 * 3600_000).toISOString() }, { bookName: 'ספר ב' }]
  assert.equal(duplicateConfirm(history, 'ספר ב'), null)
  assert.equal(duplicateConfirm([], 'ספר א'), null)
  const c = duplicateConfirm(history, 'ספר א')
  assert.equal(c.title, 'לשלוח שוב תזכורת על הספר הזה?')
  assert.match(c.body, /לפני 3 שעות/)
  assert.match(c.body, /"ספר א"/)
})

test('sentResultText: כמה קיבלו בדואר, ומה נכשל או סונן', () => {
  assert.equal(sentResultText(4, { successful: 4, failed: 0, filteredOut: 0 }), 'התזכורת נשלחה ל-4 עורכים בדואר.')
  assert.equal(sentResultText(1, undefined), 'התזכורת נשלחה לעורך אחד בדואר.')
  assert.equal(
    sentResultText(5, { successful: 3, failed: 1, filteredOut: 1 }),
    'התזכורת נשלחה ל-3 עורכים בדואר. שליחה אחת נכשלה. עורך אחד לא קיבל (לא מאשר תזכורות, או שהחשבון לא אומת).'
  )
})

test('editorsFoundText: כמה עורכים כבר בשלב "ספר"', () => {
  assert.equal(editorsFoundText({ bookPath: '' }), '')
  assert.equal(editorsFoundText({ bookPath: 'a', checking: true }), 'בודק מי עובד על הספר…')
  assert.equal(editorsFoundText({ bookPath: 'a', found: [{}, {}, {}, {}] }), '4 עורכים עובדים על הספר ומאשרים תזכורות.')
  assert.equal(editorsFoundText({ bookPath: 'a', found: [{}] }), 'עורך אחד עובד על הספר ומאשר תזכורות.')
  assert.match(editorsFoundText({ bookPath: 'a', found: [] }), /אין למי לשלוח/)
  assert.equal(editorsFoundText({ bookPath: 'a', found: [], error: new Error('x') }), '')
})

test('שליחה בלי תשובה (408 / ניתוק) — "ייתכן שיצאה", ואישור לפני שליחה חוזרת', () => {
  assert.equal(isUncertainFailure({ status: 408 }), true)
  assert.equal(isUncertainFailure({ status: 0 }), true)
  assert.equal(isUncertainFailure({ status: 504 }), true)
  assert.equal(isUncertainFailure({ status: 500 }), false)
  assert.equal(isUncertainFailure(null), false)
  assert.match(uncertainConfirm('בראשית').body, /"בראשית"/)
})
