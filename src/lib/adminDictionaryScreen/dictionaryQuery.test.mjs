import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyRequest, groupWords, matchesSearch, paginate, parseDictionaryQuery, serializeDictionaryQuery, sortWords, updateDictionaryQuery,
  userRequest, viewCounts, visibleWords, wordRequestCount, wordRequests, wordView,
} from './dictionaryQuery.js'

const ENTRIES = [
  { userId: 'u1', name: 'משה כהן', email: 'moshe@example.com', word: 'ובכן' },
  { userId: 'u2', name: 'יעקב לוי', email: 'yaakov@example.com', word: 'ובכן' },
  { userId: 'u3', name: 'דוד', email: 'david@example.com', word: ' ובכן ' },
  { userId: 'u1', name: 'משה כהן', email: 'moshe@example.com', word: 'אדמו"ר' },
  { userId: 'u2', name: 'יעקב לוי', email: 'yaakov@example.com', word: 'זצוק"ל' },
  { userId: 'u2', name: 'יעקב לוי', email: 'yaakov@example.com', word: 'זצוק"ל' },
  { userId: 'u4', name: '', email: '', word: '' },
]
const SKIPPED = [{ userId: 'u2', word: 'זצוק"ל' }, { userId: 'u1', word: 'ובכן' }]

test('parse / serialize: ברירות מחדל לא נכתבות, ערכים לא מוכרים נזרקים', () => {
  assert.deepEqual(parseDictionaryQuery(new URLSearchParams('')), { view: 'pending', q: '', sort: 'users', page: 1 })
  assert.deepEqual(parseDictionaryQuery(new URLSearchParams('view=skipped&q=%20ובכן%20&sort=word&page=3')), { view: 'skipped', q: 'ובכן', sort: 'word', page: 3 })
  assert.deepEqual(parseDictionaryQuery({ view: 'x', sort: 'y', page: '-2' }), { view: 'pending', q: '', sort: 'users', page: 1 })
  assert.equal(serializeDictionaryQuery({ view: 'pending', q: '', sort: 'users', page: 1 }), '')
  assert.equal(serializeDictionaryQuery({ view: 'skipped', q: 'א', sort: 'word', page: 2 }), '?view=skipped&q=%D7%90&sort=word&page=2')
  assert.equal(updateDictionaryQuery({ view: 'pending', q: '', sort: 'users', page: 4 }, { q: 'x' }).page, 1)
  assert.equal(updateDictionaryQuery({ view: 'pending', q: '', sort: 'users', page: 4 }, { page: 2 }).page, 2)
})

test('groupWords: מילה אחת לכל מילה (גם עם רווחים), בלי ריקות ובלי כפילויות, עם מי שדולג', () => {
  const words = groupWords(ENTRIES, SKIPPED)
  assert.deepEqual(words.map((w) => w.word), ['ובכן', 'אדמו"ר', 'זצוק"ל'])
  const uvchen = words[0]
  assert.equal(uvchen.users.length, 3)
  assert.equal(uvchen.pending, 2)
  assert.equal(uvchen.skipped, 1)
  // המילה המקורית נשמרת לכל משתמש — היא שנשלחת לשרת
  assert.equal(uvchen.users[2].word, ' ובכן ')
  const z = words[2]
  assert.equal(z.users.length, 1)
  assert.equal(wordView(z), 'skipped')
  assert.equal(wordView(uvchen), 'pending')
  assert.deepEqual(viewCounts(words), { pending: 2, skipped: 1 })
})

test('מיון: הכי הרבה משתמשים קודם, ובשוויון — א"ב; או א"ב בלבד', () => {
  const words = groupWords(ENTRIES, [])
  assert.deepEqual(sortWords(words, 'users').map((w) => w.word), ['ובכן', 'אדמו"ר', 'זצוק"ל'])
  assert.deepEqual(sortWords(words, 'word').map((w) => w.word), ['אדמו"ר', 'ובכן', 'זצוק"ל'])
})

test('חיפוש: במילה, בשם ובדואר', () => {
  const [uvchen] = groupWords(ENTRIES, [])
  assert.equal(matchesSearch(uvchen, 'בכ'), true)
  assert.equal(matchesSearch(uvchen, 'לוי'), true)
  assert.equal(matchesSearch(uvchen, 'DAVID@'), true)
  assert.equal(matchesSearch(uvchen, 'אין'), false)
  assert.equal(matchesSearch(uvchen, '  '), true)
})

test('visibleWords: לשונית + חיפוש; מילה שטופלה נשארת במקומה גם כשיצאה מהנתונים', () => {
  const words = groupWords(ENTRIES, SKIPPED)
  const q = { view: 'pending', q: '', sort: 'users', page: 1 }
  assert.deepEqual(visibleWords(words, q).map((w) => w.word), ['ובכן', 'אדמו"ר'])
  assert.deepEqual(visibleWords(words, { ...q, view: 'skipped' }).map((w) => w.word), ['זצוק"ל'])
  // "ובכן" אושרה — יצאה מהנתונים, ונשארת בשורה שלה (עם אותם משתמשים)
  const snapshot = words[0]
  const after = words.slice(1)
  const handled = new Map([['ובכן', { view: 'pending', snapshot }]])
  assert.deepEqual(visibleWords(after, q, handled).map((w) => w.word), ['ובכן', 'אדמו"ר'])
  // "אדמו"ר" דולגה — בנתונים היא כבר "דולגו", אבל נשארת בלשונית "ממתינות" עד הרענון
  const skippedNow = groupWords(ENTRIES, [...SKIPPED, { userId: 'u1', word: 'אדמו"ר' }])
  const handled2 = new Map([['אדמו"ר', { view: 'pending', snapshot: words[1] }]])
  assert.deepEqual(visibleWords(skippedNow, q, handled2).map((w) => w.word), ['ובכן', 'אדמו"ר'])
  assert.deepEqual(visibleWords(skippedNow, { ...q, view: 'skipped' }, handled2).map((w) => w.word), ['זצוק"ל'])
})

test('wordRequests: אותו גוף כמו קודם, זוג אחר זוג', () => {
  const [uvchen] = groupWords(ENTRIES, SKIPPED)
  assert.deepEqual(wordRequests(uvchen, 'approve'), [
    { action: 'add-global', userId: 'u1', word: 'ובכן' },
    { action: 'add-global', userId: 'u2', word: 'ובכן' },
    { action: 'add-global', userId: 'u3', word: ' ובכן ' },
  ])
  // דלג — רק מי שעוד לא דולג
  assert.deepEqual(wordRequests(uvchen, 'skip'), [
    { action: 'skip', userId: 'u2', word: 'ובכן' },
    { action: 'skip', userId: 'u3', word: ' ובכן ' },
  ])
  assert.equal(wordRequests(uvchen, 'remove').every((r) => r.action === 'remove-personal'), true)
  assert.deepEqual(wordRequests(uvchen, 'other'), [])
})

test('applyRequest: כמו המסך הקודם — add-global / remove-personal מוציאים את הזוג; skip מוסיף דילוג', () => {
  const data = { entries: ENTRIES, skipped: SKIPPED }
  const a = applyRequest(data, { action: 'add-global', userId: 'u1', word: 'ובכן' })
  assert.equal(a.entries.some((e) => e.userId === 'u1' && e.word === 'ובכן'), false)
  assert.equal(a.skipped.some((s) => s.userId === 'u1' && s.word === 'ובכן'), false)
  const s = applyRequest(data, { action: 'skip', userId: 'u3', word: ' ובכן ' })
  assert.equal(s.entries.length, ENTRIES.length)
  assert.equal(s.skipped.some((x) => x.userId === 'u3' && x.word === ' ובכן '), true)
})

test('paginate: 50 בעמוד', () => {
  const items = Array.from({ length: 120 }, (_, i) => i)
  const p = paginate(items, 3)
  assert.equal(p.items.length, 20)
  assert.equal(p.pageCount, 3)
  assert.equal(p.from, 101)
})

test('מילה עם רווח בקצה: דילוג נראה דולג, ופעולה מוציאה אותה — כמו שהשרת מנקה', () => {
  const words = groupWords([{ userId: 'u9', name: 'א', email: '', word: ' שלום' }], [{ userId: 'u9', word: 'שלום' }])
  assert.equal(words[0].skipped, 1)
  assert.equal(wordView(words[0]), 'skipped')
  const after = applyRequest({ entries: [{ userId: 'u9', word: ' שלום' }], skipped: [{ userId: 'u9', word: 'שלום' }] }, { action: 'remove-personal', userId: 'u9', word: ' שלום' })
  assert.deepEqual(after, { entries: [], skipped: [] })
})

test('פעולה על משתמש אחד — בקשה אחת, אותו גוף כמו שורה במסך הקודם; וכמה משתמשים פעולה על מילה נוגעת בהם', () => {
  const word = groupWords(ENTRIES, SKIPPED).find((w) => w.word === 'ובכן')
  const u3 = word.users.find((u) => u.userId === 'u3')
  assert.deepEqual(userRequest(u3, 'remove'), { action: 'remove-personal', userId: 'u3', word: ' ובכן ' })
  assert.deepEqual(userRequest(u3, 'approve'), { action: 'add-global', userId: 'u3', word: ' ובכן ' })
  assert.deepEqual(userRequest(u3, 'skip'), { action: 'skip', userId: 'u3', word: ' ובכן ' })
  assert.equal(userRequest(u3, 'nope'), null)
  assert.equal(wordRequestCount(word, 'approve'), 3)
  assert.equal(wordRequestCount(word, 'skip'), 2)
})
