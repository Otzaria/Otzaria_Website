import { test } from 'node:test'
import assert from 'node:assert/strict'
import { neighborAfterRemove, toggleIds } from './selection.js'

test('toggleIds: הוספה — בלי כפילויות', () => {
  assert.deepEqual([...toggleIds(new Set(['a']), ['a', 'b'], true)], ['a', 'b'])
})

test('toggleIds: הסרה — מה שלא היה בבחירה לא משנה', () => {
  assert.deepEqual([...toggleIds(new Set(['a', 'b']), ['b', 'z'], false)], ['a'])
})

test('toggleIds: לא משנה את הבחירה המקורית', () => {
  const ids = new Set(['a'])
  const next = toggleIds(ids, ['b'], true)
  assert.notEqual(next, ids)
  assert.deepEqual([...ids], ['a'])
})

test('toggleIds: רשימה ריקה — עותק זהה', () => {
  assert.deepEqual([...toggleIds(new Set(['a']), [], true)], ['a'])
})

test('neighborAfterRemove: הבא אחרי הראשון שיצא; אין — הקודם; לא נשאר — null', () => {
  assert.equal(neighborAfterRemove(['a', 'b', 'c'], ['b']), 'c')
  assert.equal(neighborAfterRemove(['a', 'b', 'c'], ['c']), 'b')
  assert.equal(neighborAfterRemove(['a', 'b', 'c', 'd'], ['b', 'c']), 'd')
  assert.equal(neighborAfterRemove(['a', 'b', 'c'], ['b', 'c']), 'a')
  assert.equal(neighborAfterRemove(['a'], ['a']), null)
  assert.equal(neighborAfterRemove(['a'], ['x']), null)
})
