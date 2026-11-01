import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insertBlockAt } from './applyFieldEdit.js'

test('insertBlockAt: במקום הסמן, בשורה משלו', () => {
  assert.deepEqual(insertBlockAt('אב\nגד', 3, 3, '<img>'), { value: 'אב\n<img>\nגד', start: 8, end: 8 })
  assert.deepEqual(insertBlockAt('אבגד', 2, 2, '<img>').value, 'אב\n<img>\nגד')
  assert.deepEqual(insertBlockAt('אב', 2, 2, '<img>').value, 'אב\n<img>')
  assert.deepEqual(insertBlockAt('', 0, 0, '<img>').value, '<img>')
  assert.deepEqual(insertBlockAt('אב גד', 2, 3, '<img>').value, 'אב\n<img>\nגד')
})
