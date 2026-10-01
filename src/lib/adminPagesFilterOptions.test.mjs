/**
 * בדיקות מיון רשימות המסננים של דף ניהול העמודים. הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortBookNames, sortFilterUsers } from './adminPagesFilterOptions.js'

test('sortBookNames: ייחודי וממוין כמו Array.prototype.sort', () => {
  const names = ['ג', 'א', 'ב', 'א', 'Zeta', 'alpha']
  assert.deepEqual(sortBookNames(names), [...new Set(names)].sort())
  assert.deepEqual(sortBookNames(['ב', 'א', 'ב']), ['א', 'ב'])
})

test('sortBookNames: רשימה ריקה', () => {
  assert.deepEqual(sortBookNames([]), [])
})

test('sortFilterUsers: מסיר כפילויות לפי id וממיין לפי שם', () => {
  const users = [
    { id: '2', name: 'גד' },
    { id: '1', name: 'אבי' },
    { id: '2', name: 'גד' },
    { id: '3', name: 'בני' },
  ]
  assert.deepEqual(sortFilterUsers(users), [
    { id: '1', name: 'אבי' },
    { id: '3', name: 'בני' },
    { id: '2', name: 'גד' },
  ])
})

test('sortFilterUsers: מתעלם מרשומות בלי id', () => {
  assert.deepEqual(sortFilterUsers([null, { name: 'x' }, { id: '5', name: 'ה' }]), [{ id: '5', name: 'ה' }])
})
