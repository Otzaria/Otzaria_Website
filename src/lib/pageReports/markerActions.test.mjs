import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markerLike, markerActionsFor, applyMarkerReplacement, decisionText, relocateMarkerHit } from './markerActions.js'

const hit = { start: 4, end: 16, original: 'שלמם', proposed: 'שלום' }
const MARK = '(שלמם)[שלום]'
const report = (extra = {}) => ({ status: 'approved', original: 'שלמם', proposed: 'שלום', finalOriginal: null, finalProposed: null, ...extra })
const ids = (a) => a.map((x) => x.id)

test('markerLike שומר על הצורה שבטקסט', () => {
  assert.equal(markerLike('(א) [ב]', 'ג', 'ד'), '(ג) [ד]')
  assert.equal(markerLike('(א)[ב]', 'ג', 'ד'), '(ג)[ד]')
})

test('אושר בלי שינוי נוסח: רק "החלף בתיקון"', () => {
  const a = markerActionsFor(report(), hit, MARK)
  assert.deepEqual(ids(a), ['replace'])
  assert.equal(a[0].replacement, 'שלום')
})

test('אושר בנוסח של המנהל: החלפה בנוסח שהוחלט, ועדכון הסימון לנוסח הזה', () => {
  const a = markerActionsFor(report({ finalOriginal: 'שלמם', finalProposed: 'שלומם' }), hit, MARK)
  assert.deepEqual(ids(a), ['replace', 'updateMarker'])
  assert.equal(a[0].replacement, 'שלומם')
  assert.equal(a[1].replacement, '(שלמם)[שלומם]')
  // הסימון כבר בנוסח שהוחלט — אין מה לעדכן
  const already = markerActionsFor(report({ finalProposed: 'שלומם' }), { ...hit, proposed: 'שלומם' }, '(שלמם) [שלומם]')
  assert.deepEqual(ids(already), ['replace'])
})

test('נדחה: "החזר את המקור" — המקור שבסימון', () => {
  const a = markerActionsFor(report({ status: 'rejected' }), hit, MARK)
  assert.deepEqual(ids(a), ['restore'])
  assert.equal(a[0].replacement, 'שלמם')
})

test('ממתין / חסר — אין פעולות', () => {
  assert.deepEqual(markerActionsFor(report({ status: 'pending' }), hit, MARK), [])
  assert.deepEqual(markerActionsFor(null, hit, MARK), [])
  assert.deepEqual(markerActionsFor(report(), null, MARK), [])
})

test('applyMarkerReplacement: מחליף רק את הסימון, הבחירה על הטקסט החדש', () => {
  const v = `אמר ${MARK} עליכם`
  assert.deepEqual(applyMarkerReplacement(v, hit, MARK, 'שלום'), { value: 'אמר שלום עליכם', start: 4, end: 8 })
  // תיקון ריק (מחיקה)
  assert.deepEqual(applyMarkerReplacement(v, hit, MARK, ''), { value: 'אמר  עליכם', start: 4, end: 4 })
  // הטקסט השתנה בינתיים — לא נוגעים
  assert.equal(applyMarkerReplacement('אמר שלום עליכם', hit, MARK, 'שלום'), null)
  assert.equal(applyMarkerReplacement(v, null, MARK, 'x'), null)
})

test('עריכה מחוץ לסימון שומרת על המופע, גם כשההיסט משתנה', () => {
  const before = `אמר ${MARK} עליכם`
  const tracked = { ...hit, markerText: MARK }
  for (const after of [before, `כותרת\n${before}`, before.slice(4), `${before}!`, before.slice(0, -3)]) {
    const moved = relocateMarkerHit(before, after, tracked)
    assert.ok(moved)
    assert.equal(after.slice(moved.start, moved.end), MARK)
  }
})

test('סימון שנערך או הוסר אינו עובר למופע זהה במקום אחר', () => {
  const before = `אמר ${MARK} עליכם\nאחר ${MARK} עוד`
  const tracked = { ...hit, markerText: MARK }
  assert.equal(relocateMarkerHit(before, before.replace(MARK, 'שלום'), tracked), null)
  assert.equal(relocateMarkerHit(before, before.replace('שלמם', 'שלכם'), tracked), null)
  assert.equal(relocateMarkerHit(before, before.replace(MARK, ''), tracked), null)
})

test('עריכה דו-משמעית בטקסט חוזר אינה בוחרת מופע אחר', () => {
  const tracked = { start: 0, end: MARK.length, markerText: MARK }
  assert.equal(relocateMarkerHit(MARK + MARK, MARK, tracked), null)
  assert.equal(relocateMarkerHit(MARK, MARK + MARK, tracked), null)
})

test('decisionText: מה הוחלט', () => {
  assert.equal(decisionText(report()), 'אושר. התיקון: שלום')
  assert.equal(decisionText(report({ finalProposed: 'שלומם' })), 'אושר בנוסח של המנהל. התיקון: שלומם')
  assert.equal(decisionText(report({ proposed: '' })), 'אושר: למחוק את הקטע.')
  assert.equal(decisionText(report({ status: 'rejected' })), 'נדחה. הטקסט שבספר נשאר כמו שהוא.')
  assert.equal(decisionText(report({ status: 'pending' })), '')
})
