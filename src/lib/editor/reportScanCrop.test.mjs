import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reportScanCrop } from './reportScanCrop.js'

// עמוד 1000×1000, שלוש שורות; מילים מימין לשמאל (x יורד)
const W = (text, x0, x1, y) => ({ text, bbox: [x0, y, x1, y + 20] })
const LINES = [
  { id: 0, stream: 'main', bbox: [100, 100, 900, 120], words: [W('בראשית', 700, 900, 100), W('ברא', 450, 650, 100), W('אלהים', 100, 400, 100)] },
  { id: 1, stream: 'main', bbox: [100, 140, 900, 160], words: [W('את', 800, 900, 140), W('השמים', 100, 750, 140)] },
  { id: 2, stream: 'main', bbox: [100, 180, 900, 200], words: [W('ואת', 700, 900, 180), W('הארץ', 100, 650, 180)] },
]
const SOURCE = { level: 'word', source: 'layout', size: [1000, 1000], lines: LINES }
const TEXT = 'בראשית ברא אלהים\nאת השמים\nואת הארץ'
const sel = (word) => ({ start: TEXT.indexOf(word), end: TEXT.indexOf(word) + word.length })

test('reportScanCrop: מילה אחת בשורה מזוהה → כל רוחב השורה + סימון המילה', () => {
  const r = reportScanCrop({ text: TEXT, ...sel('ברא '), source: SOURCE })
  assert.equal(r.level, 'word')
  assert.equal(r.source, 'layout')
  // שורה 0: y 100..120, שוליים 12 → 88..132; x עם 20 לכל צד
  assert.deepEqual({ x: r.x, y: r.y, w: r.w, h: r.h }, { x: 0.08, y: 0.088, w: 0.84, h: 0.044 })
  assert.deepEqual(r.mark, { x: 0.45, y: 0.1, w: 0.2, h: 0.02 })
})

test('reportScanCrop: בחירה על פני שתי שורות → איחוד השורות, בלי סימון מילים', () => {
  const start = TEXT.indexOf('אלהים')
  const end = TEXT.indexOf('השמים') + 2
  const r = reportScanCrop({ text: TEXT, start, end, source: SOURCE })
  assert.equal(r.level, 'line')
  assert.equal(r.mark, null)
  assert.equal(r.y, 0.088)
  assert.equal(r.h, 0.084)
})

test('reportScanCrop: נקודת הוספה (בחירה ריקה) — האזור של השורה שבה היא', () => {
  const pos = TEXT.indexOf('הארץ')
  const r = reportScanCrop({ text: TEXT, start: pos, end: pos, source: SOURCE })
  assert.ok(r)
  assert.equal(r.y, 0.168)
})

test('reportScanCrop: אין מקור / אין גודל / קלט שגוי → null', () => {
  assert.equal(reportScanCrop({ text: TEXT, ...sel('ברא'), source: null }), null)
  assert.equal(reportScanCrop({ text: TEXT, ...sel('ברא'), source: { ...SOURCE, size: null } }), null)
  assert.equal(reportScanCrop({ text: TEXT, ...sel('ברא'), source: { ...SOURCE, source: null } }), null)
  assert.equal(reportScanCrop({ text: TEXT, start: 5, end: 2, source: SOURCE }), null)
  assert.equal(reportScanCrop({ text: TEXT, start: 0, end: TEXT.length + 1, source: SOURCE }), null)
  assert.equal(reportScanCrop({ text: '', start: 0, end: 0, source: SOURCE }), null)
})

test('reportScanCrop: מספר המילים בשורה לא תואם לצילום (לא בטוח) → null', () => {
  const text = 'בראשית ברא אלהים ועוד שלוש מילים\nאת השמים\nואת הארץ'
  assert.equal(reportScanCrop({ text, start: 0, end: 3, source: SOURCE }), null)
})

test('reportScanCrop: שורה שנוספה בטקסט ואין לה שורה בצילום (משוערת) → null', () => {
  const text = 'בראשית ברא אלהים\nאת השמים\nואת הארץ\nשורה נוספת שאינה בצילום'
  const pos = text.indexOf('נוספת')
  assert.equal(reportScanCrop({ text, start: pos, end: pos + 5, source: SOURCE }), null)
})
