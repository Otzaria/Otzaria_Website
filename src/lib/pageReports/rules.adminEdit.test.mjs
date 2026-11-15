// נוסח המנהל בהכרעה על טעות בספר: בדיקת הקלט, הסימון שבטקסט מול הנוסח שהוחלט, והחלפת הסימון (rules.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorTextsProblem, normalizeDecision } from './rules.js'

test('errorTextsProblem: אותם כללים כמו בדיווח', () => {
  assert.equal(errorTextsProblem('שלמם', 'שלום'), null)
  assert.match(errorTextsProblem('', ' '), /יש לסמן/)
  assert.match(errorTextsProblem('א', 'א'), /זהה/)
  assert.match(errorTextsProblem('א(ב', 'ג'), /עגולים/)
  assert.match(errorTextsProblem('א', 'ג]'), /מרובעים/)
  assert.match(errorTextsProblem('א'.repeat(501), 'ב'), /ארוך/)
})

test('normalizeDecision: נוסח מנהל רק באישור, שניהם יחד; applyMode marker רק ב-apply', () => {
  assert.deepEqual(normalizeDecision({ action: 'approve', original: 'א', proposed: 'ב' }, 'book_error').value.edit, { original: 'א', proposed: 'ב' })
  assert.equal(normalizeDecision({ action: 'approve' }, 'book_error').value.edit, null)
  assert.equal(normalizeDecision({ action: 'reject', original: 'א', proposed: 'ב' }, 'book_error').value.edit, null)
  assert.equal(normalizeDecision({ action: 'approve', proposed: 'ב' }, 'book_error').ok, false)
  assert.equal(normalizeDecision({ action: 'approve', original: 'א', proposed: 'ב]' }, 'book_error').ok, false)
  assert.equal(normalizeDecision({ action: 'apply', applyMode: 'marker' }, 'book_error').value.applyMode, 'marker')
  assert.equal(normalizeDecision({ action: 'approve', applyMode: 'marker' }, 'book_error').value.applyMode, null)
})
