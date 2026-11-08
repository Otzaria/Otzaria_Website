import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffWords } from '../dicta/text-diff.js'
import { MIN_WORDS_FOR_SPLIT, changeStats, inlineGroups, suggestionLayout } from './inlineDiff.js'

/** משחזר את הנוסח הישן / החדש מהקבוצות — כדי לוודא ששום תו לא הלך לאיבוד */
const rebuild = (groups, side) => groups.map((g) => (g.type === 'equal' ? g.text : g.lead + g[side] + g.trail)).join('')
const layoutOf = (before, after) => suggestionLayout({ before, after }, diffWords(before, after))

test('מילה שהוחלפה: הישנה ומיד אחריה החדשה, והרווחים נשארים בחוץ', () => {
  const groups = inlineGroups(diffWords('ויאמר משה אל העם', 'ויאמר אהרן אל העם'))
  assert.deepEqual(groups, [
    { type: 'equal', text: 'ויאמר ' },
    { type: 'change', lead: '', del: 'משה', add: 'אהרן', trail: '' },
    { type: 'equal', text: ' אל העם' },
  ])
})

test('שינויים שמפריד ביניהם רק רווח מתאחדים לשינוי אחד', () => {
  const groups = inlineGroups(diffWords('ויבואו משה ואהרן אל', 'ויבואו יהושע וכלב אל'))
  const change = groups.filter((g) => g.type === 'change')
  assert.equal(change.length, 1)
  assert.equal(change[0].del, 'משה ואהרן')
  assert.equal(change[0].add, 'יהושע וכלב')
})

test('ירידת שורה לא מאחדת שינויים', () => {
  const groups = inlineGroups(diffWords('משה\nאהרן', 'יהושע\nכלב'))
  assert.equal(groups.filter((g) => g.type === 'change').length, 2)
})

test('רק הוספה / רק מחיקה של מילה — צד אחד ריק, והרווח שאחריה מחוץ לסימון', () => {
  const added = inlineGroups(diffWords('ויאמר אל העם', 'ויאמר משה אל העם')).find((g) => g.type === 'change')
  assert.equal(added.del, '')
  assert.equal(added.add, 'משה')
  const removed = inlineGroups(diffWords('ויאמר משה אל העם', 'ויאמר אל העם')).find((g) => g.type === 'change')
  assert.equal(removed.del, 'משה')
  assert.equal(removed.add, '')
})

test('הטקסט נשמר: הנוסח החדש משוחזר במדויק מהקבוצות', () => {
  const pairs = [
    ['ויאמר משה אל העם', 'ויאמר אהרן אל העם'],
    ['בראשית ברא אלהים', 'בראשית ברא אלקים את'],
    ['א ב ג ד', 'ה ו'],
    ['שורה ראשונה\nשורה שנייה', 'שורה ראשונה\nשורה אחרת לגמרי'],
  ]
  for (const [before, after] of pairs) {
    const groups = inlineGroups(diffWords(before, after))
    assert.equal(rebuild(groups, 'add'), after)
  }
})

test('שיעור השינוי: מילה אחת מתוך חמש — 20%', () => {
  const stats = changeStats(diffWords('א ב ג ד ה', 'א ב ו ד ה'))
  assert.equal(stats.words, 10)
  assert.equal(stats.ratio, 0.2)
  assert.deepEqual(changeStats([]), { ratio: 0, words: 0 })
})

test('תצוגה: שינוי קטן בקטע ארוך — טקסט אחד', () => {
  const before = 'ויאמר משה אל העם אל תיראו התיצבו וראו את ישועת ה׳ אשר יעשה לכם היום'
  assert.equal(layoutOf(before, before.replace('משה', 'אהרן')), 'inline')
})

test('תצוגה: קטע שנכתב מחדש כמעט כולו — שתי תיבות', () => {
  const before = 'ויאמר משה אל העם אל תיראו התיצבו וראו את ישועת ה׳'
  const after = 'וידבר אהרן לכל העדה לאמר חזקו ואמצו כי ה׳ נלחם לכם'
  assert.equal(layoutOf(before, after), 'split')
})

test('תצוגה: קטע קצר — טקסט אחד גם אם השתנה כולו', () => {
  assert.equal(layoutOf('שרש', 'שורש'), 'inline')
  assert.ok(changeStats(diffWords('שרש', 'שורש')).words < MIN_WORDS_FOR_SPLIT)
})

test('תצוגה: צד ריק (רק הוספה / רק מחיקה) — טקסט אחד', () => {
  const long = 'מילה '.repeat(30).trim()
  assert.equal(suggestionLayout({ before: '', after: long }, diffWords('', long)), 'inline')
  assert.equal(suggestionLayout({ before: long, after: '' }, diffWords(long, '')), 'inline')
})

test('תצוגה: diffWords שנפל לבלוק גס (טקסט ענק) — שתי תיבות', () => {
  const before = Array.from({ length: 1600 }, (_, i) => `מ${i}`).join(' ')
  const after = before.replace('מ5 ', 'שונה ')
  const segs = diffWords(before, after)
  assert.equal(segs.length, 2) // בלוק גס: מחיקה של הכל והוספה של הכל
  assert.equal(suggestionLayout({ before, after }, segs), 'split')
})
