import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCropRect, cropFromBoxes, unionBoxes, MAX_CROP_HEIGHT } from './cropRect.js'

test('normalizeCropRect: אזור תקין נשמר ומעוגל; מקור/רמה לא מוכרים, חריגה מ-0..1 או רוחב 0 → null', () => {
  const ok = normalizeCropRect({ x: 0.123456, y: 0.2, w: 0.5, h: 0.1, source: 'layout', level: 'line', extra: 1 })
  assert.deepEqual(ok, { x: 0.1235, y: 0.2, w: 0.5, h: 0.1, source: 'layout', level: 'line', mark: null })
  assert.equal(normalizeCropRect(null), null)
  assert.equal(normalizeCropRect('x'), null)
  assert.equal(normalizeCropRect({ x: 0, y: 0, w: 0.5, h: 0.1, source: 'evil', level: 'line' }), null)
  assert.equal(normalizeCropRect({ x: 0, y: 0, w: 0.5, h: 0.1, source: 'layout', level: 'page' }), null)
  assert.equal(normalizeCropRect({ x: -0.1, y: 0, w: 0.5, h: 0.1, source: 'layout', level: 'line' }), null)
  assert.equal(normalizeCropRect({ x: 0.6, y: 0, w: 0.5, h: 0.1, source: 'layout', level: 'line' }), null)
  assert.equal(normalizeCropRect({ x: 0, y: 0, w: 0, h: 0.1, source: 'layout', level: 'line' }), null)
  assert.equal(normalizeCropRect({ x: '0', y: 0, w: 0.5, h: 0.1, source: 'layout', level: 'line' }), null)
  assert.equal(normalizeCropRect({ x: 0, y: 0, w: 0.5, h: NaN, source: 'layout', level: 'line' }), null)
  assert.equal(normalizeCropRect({ x: 0, y: 0, w: 0.5, h: MAX_CROP_HEIGHT + 0.1, source: 'layout', level: 'line' }), null)
})

test('normalizeCropRect: סימון מילים רק ברמת מילה ובתוך האזור — אחרת יורד לרמת שורה', () => {
  const base = { x: 0.1, y: 0.1, w: 0.8, h: 0.1, source: 'proof' }
  const inside = normalizeCropRect({ ...base, level: 'word', mark: { x: 0.3, y: 0.12, w: 0.1, h: 0.05 } })
  assert.equal(inside.level, 'word')
  assert.deepEqual(inside.mark, { x: 0.3, y: 0.12, w: 0.1, h: 0.05 })
  const outside = normalizeCropRect({ ...base, level: 'word', mark: { x: 0.3, y: 0.5, w: 0.1, h: 0.05 } })
  assert.equal(outside.level, 'line')
  assert.equal(outside.mark, null)
  assert.equal(normalizeCropRect({ ...base, level: 'word', mark: 'bad' }).level, 'line')
  assert.equal(normalizeCropRect({ ...base, level: 'line', mark: { x: 0.3, y: 0.12, w: 0.1, h: 0.05 } }).mark, null)
})

test('unionBoxes: מתעלם ממסגרות לא תקינות', () => {
  assert.deepEqual(unionBoxes([[10, 10, 20, 20], [5, 15, 30, 18], null, [1, 1, 1, 1]]), [5, 10, 30, 20])
  assert.equal(unionBoxes([]), null)
})

test('cropFromBoxes: רוחב השורה עם שוליים, חתוך לגבולות התמונה, מנורמל; מילים → mark', () => {
  const r = cropFromBoxes({ lineBoxes: [[100, 200, 900, 240]], wordBoxes: [[500, 202, 600, 238]], size: [1000, 2000], source: 'layout' })
  // שוליים: 0.6 × 40 = 24 למעלה ולמטה, 2% מ-1000 = 20 לכל צד
  assert.deepEqual(r, { x: 0.08, y: 0.088, w: 0.84, h: 0.044, source: 'layout', level: 'word', mark: { x: 0.5, y: 0.101, w: 0.1, h: 0.018 } })
  const edge = cropFromBoxes({ lineBoxes: [[0, 0, 1000, 30]], size: [1000, 2000], source: 'local' })
  assert.equal(edge.x, 0)
  assert.equal(edge.y, 0)
  assert.equal(edge.w, 1)
  assert.equal(edge.level, 'line')
  assert.equal(edge.mark, null)
})

test('cropFromBoxes: בלי גודל תמונה / בלי שורות / אזור גבוה מדי → null', () => {
  assert.equal(cropFromBoxes({ lineBoxes: [[0, 0, 10, 10]], size: null, source: 'layout' }), null)
  assert.equal(cropFromBoxes({ lineBoxes: [[0, 0, 10, 10]], size: [0, 10], source: 'layout' }), null)
  assert.equal(cropFromBoxes({ lineBoxes: [], size: [100, 100], source: 'layout' }), null)
  assert.equal(cropFromBoxes({ lineBoxes: [[0, 0, 100, 10], [0, 80, 100, 90]], size: [100, 100], source: 'layout' }), null)
})
