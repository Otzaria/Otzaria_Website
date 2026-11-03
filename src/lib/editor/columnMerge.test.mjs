import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeColumns } from './columnMerge.js'

test('mergeColumns: שורה נפרדת בין הימני לשמאלי', () => {
  assert.equal(mergeColumns('א\nב', 'ג\nד'), 'א\nב\nג\nד')
})

test('mergeColumns: טור ריק לא מוסיף שורה ריקה', () => {
  assert.equal(mergeColumns('א\nב', ''), 'א\nב')
  assert.equal(mergeColumns('', 'ג'), 'ג')
  assert.equal(mergeColumns('', ''), '')
  assert.equal(mergeColumns(undefined, null), '')
})

test('mergeColumns: ימני שכבר מסתיים במעבר שורה — בלי כפילות', () => {
  assert.equal(mergeColumns('א\n', 'ג'), 'א\nג')
})
