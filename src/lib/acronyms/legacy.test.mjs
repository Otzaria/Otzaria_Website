/** בדיקות תכנון ההעברה של כינויי המתנדבים מהאתר לפורק. הרצה: npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planApprovedMigration, planPendingMigration, topCategory } from './legacy.js'

const FORK = [
  { title: 'ברכות', aliases: ['ברכ'] },
  { title: 'שבת', aliases: ['שב"ת', 'מסכת שבת'] },
]

test('pending suggestions become one group per volunteer, mapped to fork ops', () => {
  const { groups, skipped } = planPendingMigration(
    [
      { _id: 1, bookDisplayName: 'ברכות', actionType: 'add', nextAlias: 'מס׳ ברכות', submittedBy: 'u1' },
      { _id: 2, bookDisplayName: 'שבת', actionType: 'delete', currentAlias: 'מסכת שבת', submittedBy: 'u1' },
      { _id: 3, bookDisplayName: 'שבת', actionType: 'update', currentAlias: 'שב"ת', nextAlias: 'שבת קודש', submittedBy: 'u2' },
      { _id: 4, bookDisplayName: 'לא קיים', actionType: 'add', nextAlias: 'x', submittedBy: 'u2' },
      { _id: 5, bookDisplayName: 'ברכות', actionType: 'add', nextAlias: 'ברכו״ת', submittedBy: 'u2' },
      { _id: 6, bookDisplayName: 'ברכות', actionType: 'add', nextAlias: "מסכת ברכות", submittedBy: 'u2' },
    ],
    FORK
  )
  assert.deepEqual(groups, [
    { submittedBy: 'u1', ops: [{ type: 'add', book: 'ברכות', alias: "מס' ברכות" }, { type: 'remove', book: 'שבת', alias: 'מסכת שבת' }], pendingIds: ['1', '2'] },
    { submittedBy: 'u2', ops: [{ type: 'rename', book: 'שבת', from: 'שב"ת', to: 'שבת קודש' }, { type: 'add', book: 'ברכות', alias: 'מסכת ברכות' }], pendingIds: ['3', '6'] },
  ])
  // 5: ברכו"ת זהה לשם הספר בלי גרשיים
  assert.deepEqual(skipped.map((s) => s.id), ['4', '5'])
})

test('an update whose old alias is gone becomes an add', () => {
  const { groups } = planPendingMigration([{ _id: 1, bookDisplayName: 'ברכות', actionType: 'update', currentAlias: 'אין', nextAlias: 'ברכו', submittedBy: 'u' }], FORK)
  assert.deepEqual(groups[0].ops, [{ type: 'add', book: 'ברכות', alias: 'ברכו' }])
})

test('site titles with gershayim match fork titles without them, only when unambiguous', () => {
  const fork = [
    { title: 'הגהות מהרם פדווא', aliases: [] },
    { title: 'אבג', aliases: [] },
    { title: 'אב"ג', aliases: [] },
  ]
  const s = (book, alias) => ({ _id: alias, bookDisplayName: book, actionType: 'add', nextAlias: alias, submittedBy: 'u' })
  const { groups, skipped } = planPendingMigration([s('הגהות מהר"ם פדווא', 'מהר"ם פדווא'), s('א״בג', 'x')], fork)
  assert.deepEqual(groups[0].ops, [{ type: 'add', book: 'הגהות מהרם פדווא', alias: 'מהר"ם פדווא' }])
  assert.deepEqual(skipped.map((x) => x.id), ['x'])

  const approved = planApprovedMigration([{ displayName: 'הגהות מהר״ם פדווא', bookPath: 'אוצריא/הלכה/x', aliases: ['הגמ"פ'] }], fork)
  assert.deepEqual(approved.groups[0].ops, [{ type: 'add', book: 'הגהות מהרם פדווא', alias: 'הגמ"פ' }])
})

test('topCategory takes the first folder under אוצריא', () => {
  assert.equal(topCategory('אוצריא/תלמוד בבלי/סדר זרעים/ברכות.txt'), 'תלמוד בבלי')
  assert.equal(topCategory('תנך\\תורה\\בראשית'), 'תנך')
  assert.equal(topCategory(''), 'ללא קטגוריה')
})

test('approved site aliases missing in the fork become per-category PR groups', () => {
  const site = [
    { displayName: 'ברכות', bookPath: 'אוצריא/תלמוד בבלי/ברכות', aliases: ['ברכ', 'בר"כ', 'ברכות', "מס' ברכות"] },
    { displayName: 'שבת', bookPath: 'אוצריא/תלמוד בבלי/שבת', aliases: ["שב'ת", 'שב'] },
    { displayName: 'ספר לא בפורק', bookPath: 'אוצריא/שונות/x', aliases: ['סל"ב'] },
  ]
  const { groups, unmatched, skipped } = planApprovedMigration(site, FORK)
  assert.deepEqual(groups, [
    { label: 'תלמוד בבלי', books: 2, ops: [{ type: 'add', book: 'ברכות', alias: "מס' ברכות" }, { type: 'add', book: 'שבת', alias: 'שב' }] },
  ])
  assert.deepEqual(unmatched, [{ title: 'ספר לא בפורק', category: 'שונות', ops: [{ type: 'add', book: 'ספר לא בפורק', alias: 'סל"ב', newBook: true }] }])
  assert.equal(skipped, 4) // ברכ ובר"כ קיימים, ברכות = שם הספר, שב'ת = שב"ת בפורק
})

test('big categories are split without splitting a book', () => {
  const site = ['א', 'ב', 'ג'].map((t) => ({ displayName: t, bookPath: 'אוצריא/קט/' + t, aliases: ['x1', 'x2'] }))
  const fork = ['א', 'ב', 'ג'].map((t) => ({ title: t, aliases: [] }))
  const { groups } = planApprovedMigration(site, fork, { chunkSize: 3 })
  assert.deepEqual(groups.map((g) => [g.label, g.ops.length]), [['קט, חלק 1 מתוך 3', 2], ['קט, חלק 2 מתוך 3', 2], ['קט, חלק 3 מתוך 3', 2]])
})
