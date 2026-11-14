import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paginate } from './paginate.js'

const items = Array.from({ length: 53 }, (_, i) => i)

test('paginate: עמוד באמצע הרשימה', () => {
  assert.deepEqual({ ...paginate(items, 2, 25), items: undefined }, { items: undefined, page: 2, pageCount: 3, total: 53, from: 26, to: 50 })
})

test('paginate: עמוד מעבר לסוף — האחרון', () => {
  const last = paginate(items, 99, 25)
  assert.equal(last.page, 3)
  assert.deepEqual(last.items, [50, 51, 52])
})

test('paginate: עמוד לא תקין — הראשון; שבר — מעוגל כלפי מטה', () => {
  for (const bad of [0, -3, NaN, undefined, null]) assert.equal(paginate(items, bad, 25).page, 1)
  assert.equal(paginate(items, 2.7, 25).page, 2)
  assert.equal(paginate(items, 2.7, 25).from, 26)
})

test('paginate: רשימה ריקה או חסרה', () => {
  const empty = { items: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 }
  assert.deepEqual(paginate([], 1, 25), empty)
  assert.deepEqual(paginate(undefined, 1, 25), empty)
  assert.deepEqual(paginate(null, 4, 25), empty)
})
