import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { textSegments, buildSearchRegex, replaceOutsideTags, findOutsideTags, findNextOutsideTags, rangeInText } from './textOnlyReplace.js'

describe('textOnlyReplace — קטעי טקסט', () => {
  it('תגים וישויות מחוץ לקטעים; מעברי שורה בתוכם', () => {
    const raw = '<h2>כותרת</h2>\nשורה&#160;שנייה'
    const segs = textSegments(raw).map((s) => raw.slice(s.start, s.end))
    assert.deepEqual(segs, ['כותרת', '\nשורה', 'שנייה'])
  })
  it('ריק / בלי תגים', () => {
    assert.deepEqual(textSegments(''), [])
    assert.deepEqual(textSegments('אבג'), [{ start: 0, end: 3 }])
  })
})

describe('textOnlyReplace — replaceOutsideTags', () => {
  it('ניקוי ספרות לא נוגע ב-<h2> וב-base64 של תמונה', () => {
    const raw = '<h2>פרק 12</h2>\n<img src="data:image/png;base64,AB12CD">דף 3'
    const { value, count } = replaceOutsideTags(raw, /[0-9]/g, '')
    assert.equal(value, '<h2>פרק </h2>\n<img src="data:image/png;base64,AB12CD">דף ')
    assert.equal(count, 3)
  })
  it('החלף הכול של i לא הופך <i> ל-<X>', () => {
    const { value, count } = replaceOutsideTags('<i>hi</i> i', buildSearchRegex('i', false), 'X')
    assert.equal(value, '<i>hX</i> X')
    assert.equal(count, 2)
  })
  it('ביטוי רגולרי עם $1, ו-^13 חוצה שורות', () => {
    assert.equal(replaceOutsideTags('אב גד', buildSearchRegex('(א)ב', true), '$1$1').value, 'אא גד')
    assert.equal(replaceOutsideTags('א\nב', buildSearchRegex('א^13ב', false), 'אב').value, 'אב')
  })
  it('ישות לא נשברת', () => {
    assert.equal(replaceOutsideTags('a&#160;1', /[0-9]/g, '').value, 'a&#160;')
  })
  it('אין התאמה — אותו ערך, 0', () => {
    assert.deepEqual(replaceOutsideTags('<b>x</b>', /b/g, 'B'), { value: '<b>x</b>', count: 0 })
  })
})

describe('textOnlyReplace — חיפוש', () => {
  it('חפש הבא מדלג על התאמות בתוך תגים', () => {
    const raw = '<big>x</big> big'
    const hit = findOutsideTags(raw, buildSearchRegex('big', false), 0)
    assert.equal(hit?.index, 13)
  })
  it('מתחיל מ-from, ובלי התאמה — חוזר להתחלה', () => {
    const re = buildSearchRegex('א', false)
    assert.deepEqual(findNextOutsideTags('א <b>ב</b> א', re, 1), { index: 11, length: 1, wrapped: false })
    assert.deepEqual(findNextOutsideTags('א <b>ב</b> א', re, 12), { index: 0, length: 1, wrapped: true })
    assert.equal(findNextOutsideTags('<i>i</i>', buildSearchRegex('<i>', false), 0), null)
  })
  it('buildSearchRegex — ביטוי לא תקין / ריק → null', () => {
    assert.equal(buildSearchRegex('(', true), null)
    assert.equal(buildSearchRegex('', false), null)
    assert.equal(replaceOutsideTags('(א)', buildSearchRegex('(', false), '').value, 'א)')
  })
  it('rangeInText', () => {
    assert.equal(rangeInText('<b>אב</b>', 3, 5), true)
    assert.equal(rangeInText('<b>אב</b>', 1, 2), false)
  })
})
