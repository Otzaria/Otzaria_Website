import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildErrorMarker, normalizeReportInput, normalizeDecision,
  MAX_CONTEXT,
} from './rules.js'

const base = { kind: 'book_error', bookPath: 'ספר', pageNumber: 3 }

test('buildErrorMarker', () => {
  assert.equal(buildErrorMarker('שלם', 'שלום'), '(שלם)[שלום]')
})

test('normalizeReportInput — טעות בספר תקינה', () => {
  const r = normalizeReportInput({ ...base, original: 'שלם', proposed: 'שלום', column: 'right', offset: 5 })
  assert.equal(r.ok, true)
  assert.equal(r.value.column, 'right')
  assert.equal(r.value.offset, 5)
})

test('normalizeReportInput — דחיות', () => {
  assert.equal(normalizeReportInput(null).ok, false)
  assert.equal(normalizeReportInput({ ...base, kind: 'x' }).ok, false)
  assert.equal(normalizeReportInput({ ...base, pageNumber: 0, original: 'a', proposed: 'b' }).ok, false)
  assert.equal(normalizeReportInput({ ...base, original: 'אב', proposed: 'אב' }).ok, false)
  assert.equal(normalizeReportInput({ ...base, original: '', proposed: '' }).ok, false)
  assert.equal(normalizeReportInput({ ...base, original: 'א(ב', proposed: 'אב' }).ok, false)
  assert.equal(normalizeReportInput({ ...base, original: 'אב', proposed: 'א]ב' }).ok, false)
  assert.equal(normalizeReportInput({ ...base, original: 'x'.repeat(501), proposed: 'b' }).ok, false)
})

test('normalizeReportInput — מחיקה (תיקון ריק) והוספה (מקור ריק) מותרות', () => {
  assert.equal(normalizeReportInput({ ...base, original: 'מיותר', proposed: '' }).ok, true)
  assert.equal(normalizeReportInput({ ...base, original: '', proposed: 'חסר' }).ok, true)
})

test('normalizeReportInput — הודעה חופשית', () => {
  assert.equal(normalizeReportInput({ ...base, kind: 'message', message: '  ' }).ok, false)
  const r = normalizeReportInput({ ...base, kind: 'message', message: ' העמוד חתוך ' })
  assert.deepEqual(r.value, { kind: 'message', bookPath: 'ספר', pageNumber: 3, message: 'העמוד חתוך' })
})

test('normalizeDecision', () => {
  assert.equal(normalizeDecision({ action: 'approve' }, 'book_error').value.applyToText, false)
  assert.equal(normalizeDecision({ action: 'approve', applyToText: true }, 'book_error').value.applyToText, true)
  assert.equal(normalizeDecision({ action: 'apply' }, 'book_error').value.applyToText, true)
  assert.equal(normalizeDecision({ action: 'approve' }, 'message').ok, false)
  assert.equal(normalizeDecision({ action: 'handled', applyToText: true }, 'message').value.applyToText, false)
})

test('normalizeReportInput: cropRect תקין נשמר; פגום → null בלי להכשיל את הדיווח', () => {
  const base = { kind: 'book_error', bookPath: 'sefer', pageNumber: 1, original: 'א', proposed: 'ב' }
  const cropRect = { x: 0.1, y: 0.2, w: 0.8, h: 0.05, source: 'proof', level: 'line' }
  const ok = normalizeReportInput({ ...base, cropRect })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.value.cropRect, { ...cropRect, mark: null })
  const bad = normalizeReportInput({ ...base, cropRect: { x: 'a', source: 'hack' } })
  assert.equal(bad.ok, true)
  assert.equal(bad.value.cropRect, null)
  assert.equal(normalizeReportInput(base).value.cropRect, null)
})

test('normalizeReportInput: הקשר ארוך לפני הטקסט נחתך מההתחלה (נשאר הסוף הצמוד לסימון)', () => {
  const before = 'א'.repeat(1000) + 'סוף'
  const r = normalizeReportInput({ kind: 'book_error', bookPath: 'b', pageNumber: 1, original: 'x', proposed: 'y', contextBefore: before })
  assert.equal(r.ok, true)
  assert.equal(r.value.contextBefore.length, MAX_CONTEXT)
  assert.ok(r.value.contextBefore.endsWith('סוף'))
})
