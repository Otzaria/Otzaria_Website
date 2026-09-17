/**
 * בדיקות פעולות סידור מחדש של רשימה (חיצים + גרירה-ושחרור) בלשונית "סידור החנות".
 * הרצה: node --test src/app/library/admin/plugins/listReorder.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveItem, reorderList } from './listReorder.js'

test('moveItem: מזיז פריט צעד אחד קדימה (direction=1) ומחליף עם השכן', () => {
  const result = moveItem(['a', 'b', 'c'], 0, 1)
  assert.deepEqual(result, ['b', 'a', 'c'])
})

test('moveItem: מזיז פריט צעד אחד אחורה (direction=-1) ומחליף עם השכן', () => {
  const result = moveItem(['a', 'b', 'c'], 2, -1)
  assert.deepEqual(result, ['a', 'c', 'b'])
})

test('moveItem: בגבול הרשימה (ראשון למעלה / אחרון למטה) מחזיר את הרשימה ללא שינוי', () => {
  const list = ['a', 'b', 'c']
  assert.deepEqual(moveItem(list, 0, -1), list)
  assert.deepEqual(moveItem(list, 2, 1), list)
})

test('moveItem: לא משנה את הרשימה המקורית (immutable)', () => {
  const list = ['a', 'b', 'c']
  const result = moveItem(list, 0, 1)
  assert.deepEqual(list, ['a', 'b', 'c'])
  assert.notEqual(result, list)
})

test('reorderList: מעביר פריט מאמצע הרשימה לתחילתה', () => {
  const result = reorderList(['a', 'b', 'c', 'd'], 2, 0)
  assert.deepEqual(result, ['c', 'a', 'b', 'd'])
})

test('reorderList: מעביר פריט מתחילת הרשימה לסופה', () => {
  const result = reorderList(['a', 'b', 'c', 'd'], 0, 3)
  assert.deepEqual(result, ['b', 'c', 'd', 'a'])
})

test('reorderList: אינדקס יעד זהה למקור משאיר את הרשימה כפי שהיא', () => {
  const result = reorderList(['a', 'b', 'c'], 1, 1)
  assert.deepEqual(result, ['a', 'b', 'c'])
})

test('reorderList: לא משנה את הרשימה המקורית (immutable)', () => {
  const list = ['a', 'b', 'c']
  const result = reorderList(list, 0, 2)
  assert.deepEqual(list, ['a', 'b', 'c'])
  assert.notEqual(result, list)
})
