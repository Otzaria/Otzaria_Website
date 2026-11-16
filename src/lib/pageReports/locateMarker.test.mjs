import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  markerForms, markerTextPairs, findMarkerOccurrences, locateReportMarker, locateReportInFields,
} from './locateMarker.js'

const report = (extra = {}) => ({ original: 'שלמם', proposed: 'שלום', offset: null, contextBefore: '', contextAfter: '', column: 'content', ...extra })

test('שתי צורות הסימון — עם רווח ובלי', () => {
  assert.deepEqual(markerForms('א', 'ב'), ['(א) [ב]', '(א)[ב]'])
})

test('צמדי נוסח: של המדווח, ואחריו של המנהל רק כשהוא שונה', () => {
  assert.deepEqual(markerTextPairs(report()), [{ original: 'שלמם', proposed: 'שלום' }])
  assert.deepEqual(markerTextPairs(report({ finalOriginal: 'שלמם', finalProposed: 'שלום' })), [{ original: 'שלמם', proposed: 'שלום' }])
  assert.deepEqual(markerTextPairs(report({ finalOriginal: null, finalProposed: 'שלומם' })), [
    { original: 'שלמם', proposed: 'שלום' }, { original: 'שלמם', proposed: 'שלומם' },
  ])
})

test('נמצא בצורה הישנה ובחדשה', () => {
  const oldText = 'אמר (שלמם)[שלום] עליכם'
  assert.deepEqual(locateReportMarker(oldText, report()), { start: 4, end: 16, original: 'שלמם', proposed: 'שלום', count: 1 })
  const newText = 'אמר (שלמם) [שלום] עליכם'
  const hit = locateReportMarker(newText, report())
  assert.equal(newText.slice(hit.start, hit.end), '(שלמם) [שלום]')
})

test('לא נמצא — null; טקסט/דיווח חסרים לא זורקים', () => {
  assert.equal(locateReportMarker('אמר שלום עליכם', report()), null)
  assert.equal(locateReportMarker(undefined, report()), null)
  assert.equal(locateReportMarker('()[]', {}), null)
})

test('תיקון ריק (מחיקה) ומקור ריק (הוספה)', () => {
  assert.equal(locateReportMarker('א (וו)[] ב', report({ original: 'וו', proposed: '' }))?.start, 2)
  assert.equal(locateReportMarker('א () [ו] ב', report({ original: '', proposed: 'ו' }))?.start, 2)
})

test('הסימון בנוסח המנהל (אם כבר עודכן) — נמצא גם הוא', () => {
  const r = report({ finalOriginal: 'שלמם', finalProposed: 'שלומם' })
  const hit = locateReportMarker('אמר (שלמם) [שלומם] עליכם', r)
  assert.equal(hit?.proposed, 'שלומם')
})

test('כמה מופעים: לפי ההקשר השמור, ובשוויון — הקרוב ל-offset', () => {
  const text = 'אמר (שלמם)[שלום] עליכם. ויאמר (שלמם)[שלום] לכם'
  const second = text.lastIndexOf('(שלמם)')
  const byContext = locateReportMarker(text, report({ contextBefore: 'ויאמר ', contextAfter: ' לכם', offset: 0 }))
  assert.equal(byContext.start, second)
  assert.equal(byContext.count, 2)
  const byOffset = locateReportMarker(text, report({ offset: second - 3 }))
  assert.equal(byOffset.start, second)
  const first = locateReportMarker(text, report())
  assert.equal(first.start, 4)
})

test('מופעים חופפים לא נספרים פעמיים', () => {
  const hits = findMarkerOccurrences('(א)[ב] (א) [ב]', report({ original: 'א', proposed: 'ב' }))
  assert.equal(hits.length, 2)
})

test('בשדות: קודם הטור שדווח, ואחר כך השאר', () => {
  const fields = [
    { column: 'right', value: 'ימין (שלמם)[שלום]' },
    { column: 'left', value: 'שמאל (שלמם)[שלום]' },
  ]
  assert.equal(locateReportInFields(fields, report({ column: 'left' })).column, 'left')
  assert.equal(locateReportInFields(fields, report({ column: 'right' })).column, 'right')
  // דווח בטור אחד, ובינתיים העמוד אוחד/פוצל
  assert.equal(locateReportInFields([{ column: 'content', value: 'x (שלמם)[שלום]' }], report({ column: 'left' })).column, 'content')
  assert.equal(locateReportInFields([], report()), null)
  assert.equal(locateReportInFields(null, report()), null)
})
