import { describe, it, expect } from 'vitest'
import { answerBody, answerReady, boxStyle, contextParts, isTypingTarget, keyAction, optionText, pushExclude, toWords } from './fastLogic'

const item = {
  id: 'i1',
  question: 'replace',
  options: [
    { id: 'a', label: '', words: ['אמר', 'רבי'] },
    { id: 'b', label: '', words: ['א"ר'] },
  ],
  allowText: true,
  ctxBefore: ['מאימתי', 'קורין'],
  ctxAfter: ['יוחנן'],
  focus: null,
}

describe('fastLogic — מקשים', () => {
  const ev = (key, extra = {}) => ({ key, target: { tagName: 'BODY' }, ...extra })
  it('1..4 בוחרים לפי סדר האפשרויות; מספר בלי אפשרות — כלום', () => {
    expect(keyAction(ev('1'), item)).toEqual({ type: 'choose', id: 'a' })
    expect(keyAction(ev('2'), item)).toEqual({ type: 'choose', id: 'b' })
    expect(keyAction(ev('3'), item)).toBeNull()
  })
  it('Enter / N / O / U, גם בפריסה עברית', () => {
    expect(keyAction(ev('Enter'), item)).toEqual({ type: 'submit' })
    expect(keyAction(ev('n'), item)).toEqual({ type: 'skip' })
    expect(keyAction(ev('מ'), item)).toEqual({ type: 'skip' })
    expect(keyAction(ev('O'), item)).toEqual({ type: 'other' })
    expect(keyAction(ev('u'), item)).toEqual({ type: 'unclear' })
    expect(keyAction(ev('o'), { ...item, allowText: false })).toBeNull()
  })
  it('מתעלמים בתוך שדה הקלדה ועם מקשי שינוי', () => {
    expect(keyAction(ev('1', { target: { tagName: 'INPUT' } }), item)).toBeNull()
    expect(keyAction(ev('1', { target: { tagName: 'DIV', isContentEditable: true } }), item)).toBeNull()
    expect(keyAction(ev('1', { ctrlKey: true }), item)).toBeNull()
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(keyAction(ev('1'), null)).toBeNull()
  })
})

describe('fastLogic — תשובה', () => {
  it('answerReady / answerBody: "משהו אחר" דורש טקסט', () => {
    expect(answerReady(null)).toBe(false)
    expect(answerReady({ choice: 'a' })).toBe(true)
    expect(answerReady({ choice: 'other', text: '  ' })).toBe(false)
    expect(answerBody({ choice: 'other', text: ' אמר רב ' }, 'fast')).toEqual({ choice: 'other', text: 'אמר רב', via: 'fast' })
    expect(answerBody({ choice: 'unclear', text: 'x' })).toEqual({ choice: 'unclear' })
    expect(answerBody({ choice: 'other', text: '' })).toBeNull()
  })
  it('pushExclude — בסוף, בלי כפילות, עד 12', () => {
    let l = []
    for (let i = 0; i < 15; i++) l = pushExclude(l, `id${i}`)
    expect(l).toHaveLength(12)
    expect(l[0]).toBe('id3')
    expect(pushExclude(['a', 'b'], 'a')).toEqual(['b', 'a'])
  })
})

describe('fastLogic — הקשר ומסגרת', () => {
  it('contextParts: האפשרות שנבחרה, הטקסט שהוקלד, המילים שבשאלה, או מקום ריק', () => {
    expect(contextParts(item, null)).toMatchObject({ before: ['מאימתי', 'קורין'], middle: [], after: ['יוחנן'], mode: 'gap' })
    expect(contextParts(item, { choice: 'b' })).toMatchObject({ middle: ['א"ר'], mode: 'option' })
    expect(contextParts(item, { choice: 'other', text: 'אמר ר\'' })).toMatchObject({ middle: ['אמר', "ר'"], mode: 'text' })
    expect(contextParts({ ...item, focus: ['רבי'] }, { choice: 'unclear' })).toMatchObject({ middle: ['רבי'], mode: 'focus' })
  })
  it('optionText / toWords', () => {
    expect(optionText({ id: 'yes', label: 'כן, נדפס כאן' })).toBe('כן, נדפס כאן')
    expect(optionText(item.options[0])).toBe('אמר רבי')
    expect(toWords('  א  ב ')).toEqual(['א', 'ב'])
  })
  it('boxStyle — אחוזים מתוך שברים; תיבה פגומה — null', () => {
    expect(boxStyle({ x: 0.1, y: 0.2, w: 0.3, h: 0.05 })).toEqual({ left: '10%', top: '20%', width: '30%', height: '5%' })
    expect(boxStyle([0, 0, 0.5, 0.5])).toMatchObject({ width: '50%' })
    expect(boxStyle({ x: 0, y: 0, w: 0, h: 1 })).toBeNull()
    expect(boxStyle(null)).toBeNull()
  })
})
