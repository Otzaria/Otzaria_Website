import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePageRange, pageInRange, pageRangeFields, pageRangeText, parsePageRangeInput, rangePageCount } from './pageRange.js'

test('parsePageRangeInput: שדות ריקים / טווח מלא = הכל (null)', () => {
  assert.deepEqual(parsePageRangeInput({ from: '', to: '' }, { total: 10 }), { ok: true, range: null })
  assert.deepEqual(parsePageRangeInput({ from: '1', to: '10' }, { total: 10 }), { ok: true, range: null })
  assert.deepEqual(parsePageRangeInput({ from: ' 1 ', to: '' }, { total: 10 }), { ok: true, range: null })
  assert.deepEqual(parsePageRangeInput({}, {}), { ok: true, range: null })
})

test('parsePageRangeInput: מ-ריק = 1, עד-ריק = הסוף', () => {
  assert.deepEqual(parsePageRangeInput({ from: '', to: '4' }, { total: 10 }), { ok: true, range: { from: 1, to: 4 } })
  assert.deepEqual(parsePageRangeInput({ from: '7', to: '' }, { total: 10 }), { ok: true, range: { from: 7, to: 10 } })
  assert.deepEqual(parsePageRangeInput({ from: 3, to: 3 }, { total: 10 }), { ok: true, range: { from: 3, to: 3 } })
})

test('parsePageRangeInput: שגיאות — לא מספר, אפס, מחוץ לספר, הפוך', () => {
  assert.equal(parsePageRangeInput({ from: 'א', to: '' }, { total: 10 }).field, 'from')
  assert.equal(parsePageRangeInput({ from: '0', to: '' }, { total: 10 }).ok, false)
  assert.equal(parsePageRangeInput({ from: '2.5', to: '' }, { total: 10 }).ok, false)
  assert.equal(parsePageRangeInput({ from: '-1', to: '' }, { total: 10 }).ok, false)
  assert.deepEqual(parsePageRangeInput({ from: '11', to: '' }, { total: 10 }), { ok: false, field: 'from', error: 'יש רק 10 עמודים.' })
  assert.deepEqual(parsePageRangeInput({ from: '2', to: '12' }, { total: 10 }), { ok: false, field: 'to', error: 'יש רק 10 עמודים.' })
  assert.deepEqual(parsePageRangeInput({ from: '8', to: '3' }, { total: 10 }), { ok: false, field: 'to', error: 'עמוד הסוף לפני עמוד ההתחלה.' })
})

test('parsePageRangeInput: בלי total — "עד" חובה אם "מ" מולא', () => {
  assert.equal(parsePageRangeInput({ from: '3', to: '' }).ok, false)
  assert.deepEqual(parsePageRangeInput({ from: '3', to: '9' }), { ok: true, range: { from: 3, to: 9 } })
  assert.deepEqual(parsePageRangeInput({ from: '1', to: '9' }), { ok: true, range: { from: 1, to: 9 } })
})

test('normalizePageRange: null/חסר = הכל; רק מספרים שלמים ותקינים', () => {
  assert.deepEqual(normalizePageRange(undefined), { ok: true, range: null })
  assert.deepEqual(normalizePageRange(null), { ok: true, range: null })
  assert.deepEqual(normalizePageRange({ from: 2, to: 5 }), { ok: true, range: { from: 2, to: 5 } })
  assert.deepEqual(normalizePageRange({ from: 2, to: 5, extra: 1 }), { ok: true, range: { from: 2, to: 5 } })
  for (const bad of [{ from: '2', to: 5 }, { from: 0, to: 5 }, { from: 6, to: 5 }, { from: 1.5, to: 5 }, { from: 1 }, [1, 2], 'x', 7, { from: 1, to: 1e9 }]) {
    assert.equal(normalizePageRange(bad).ok, false, JSON.stringify(bad))
  }
})

test('pageInRange / rangePageCount / pageRangeText / pageRangeFields', () => {
  assert.equal(pageInRange(5, null), true)
  assert.equal(pageInRange(5, { from: 5, to: 5 }), true)
  assert.equal(pageInRange(4, { from: 5, to: 9 }), false)
  assert.equal(pageInRange(10, { from: 5, to: 9 }), false)
  assert.equal(rangePageCount(null, 30), 30)
  assert.equal(rangePageCount({ from: 5, to: 9 }, 30), 5)
  assert.equal(rangePageCount({ from: 5, to: 90 }, 30), 26)
  assert.equal(rangePageCount({ from: 5, to: 9 }), 5)
  assert.equal(pageRangeText(null), 'כל העמודים')
  assert.equal(pageRangeText({ from: 4, to: 4 }), 'עמוד 4')
  assert.equal(pageRangeText({ from: 4, to: 9 }), 'עמודים 4–9')
  assert.deepEqual(pageRangeFields(null), { from: '', to: '' })
  assert.deepEqual(pageRangeFields({ from: 4, to: 9 }), { from: '4', to: '9' })
})
