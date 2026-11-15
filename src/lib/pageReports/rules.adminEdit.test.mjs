// נוסח המנהל בהכרעה על טעות בספר: בדיקת הקלט, הסימון שבטקסט מול הנוסח שהוחלט, והחלפת הסימון (rules.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentMarker, errorTextsProblem, finalTexts, markerNeedsUpdate, normalizeDecision, resolveMarker } from './rules.js'
import { adminReportShape, myReportShape } from './shapes.js'

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

test('currentMarker / finalTexts / markerNeedsUpdate', () => {
  const r = { original: 'שלמם', proposed: 'שלום' }
  assert.deepEqual(currentMarker(r), r)
  assert.deepEqual(finalTexts(r), r)
  assert.equal(markerNeedsUpdate(r), false)
  const edited = { ...r, finalOriginal: 'שלמם', finalProposed: 'שלומם' }
  assert.equal(markerNeedsUpdate(edited), true)
  assert.equal(markerNeedsUpdate({ ...edited, markerOriginal: 'שלמם', markerProposed: 'שלומם' }), false)
})

test('resolveMarker עם נוסח מנהל: marker / proposed / original', () => {
  const text = 'אמר (שלמם)[שלום] עליכם'
  const marker = { original: 'שלמם', proposed: 'שלום', offset: 4 }
  const final = { original: 'שלמם', proposed: 'שלומם' }
  assert.equal(resolveMarker(text, marker, 'marker', final).text, 'אמר (שלמם)[שלומם] עליכם')
  assert.equal(resolveMarker(text, marker, 'proposed', final).text, 'אמר שלומם עליכם')
  assert.equal(resolveMarker(text, marker, 'original', final).text, 'אמר שלמם עליכם')
  assert.equal(resolveMarker(text, marker, 'proposed').text, 'אמר שלום עליכם')
})

test('shapes: נוסח המנהל רק כשהוא קיים; markerStale כשהסימון בטקסט בנוסח הקודם', () => {
  const base = { _id: 'x', kind: 'book_error', original: 'שלמם', proposed: 'שלום', status: 'approved', column: 'content' }
  const page = { status: 'in-progress', content: 'אמר (שלמם)[שלום] עליכם' }
  const plain = adminReportShape(base, page)
  assert.equal(plain.finalProposed, null)
  assert.equal(plain.markerStale, false)
  const edited = adminReportShape({ ...base, finalOriginal: 'שלמם', finalProposed: 'שלומם', finalByName: 'מנהל' }, page)
  assert.equal(edited.finalProposed, 'שלומם')
  assert.equal(edited.finalByName, 'מנהל')
  assert.equal(edited.markerStale, true)
  const mine = myReportShape({ ...base, finalOriginal: 'שלמם', finalProposed: 'שלומם', finalByName: 'מנהל' })
  assert.equal(mine.finalProposed, 'שלומם')
  assert.equal('finalByName' in mine, false)
})
