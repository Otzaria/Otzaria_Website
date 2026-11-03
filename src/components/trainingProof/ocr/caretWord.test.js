import { describe, it, expect } from 'vitest'
import { wordSpans, wordIndexAt, mixedDirection, inkBoxFor } from './caretWord'

// המילה שתחת הסמן, והתיבה שלה בתמונה רק כשההתאמה ודאית

const BOXES = [
  [300, 0, 380, 40], // הימנית = המילה הראשונה בעברית
  [180, 0, 280, 40],
  [20, 0, 160, 40],
]

describe('wordSpans / wordIndexAt', () => {
  it('מיקומי המילים, גם עם רווחים כפולים', () => {
    expect(wordSpans('אמר  רבי יצחק')).toEqual([
      { s: 0, e: 3 },
      { s: 5, e: 8 },
      { s: 9, e: 13 },
    ])
    expect(wordSpans('')).toEqual([])
    expect(wordSpans('   ')).toEqual([])
  })

  it('סמן בתחילת מילה, באמצעה ומיד אחריה — אותה מילה; בתוך רווח — המילה שאחריו', () => {
    const sp = wordSpans('אמר  רבי יצחק')
    expect(wordIndexAt(sp, 0)).toBe(0)
    expect(wordIndexAt(sp, 2)).toBe(0)
    expect(wordIndexAt(sp, 3)).toBe(0)
    expect(wordIndexAt(sp, 4)).toBe(1)
    expect(wordIndexAt(sp, 9)).toBe(2)
    expect(wordIndexAt(sp, 13)).toBe(2)
    expect(wordIndexAt(sp, 99)).toBe(2)
    expect(wordIndexAt([], 0)).toBe(-1)
  })
})

describe('inkBoxFor', () => {
  it('עברית: המילה k = קטע-הדיו k מימין', () => {
    expect(inkBoxFor({ text: 'אמר רבי יצחק', k: 0, boxes: BOXES })).toEqual(BOXES[0])
    expect(inkBoxFor({ text: 'אמר רבי יצחק', k: 2, boxes: BOXES })).toEqual(BOXES[2])
  })

  it('לטינית (משמאל לימין): המילה הראשונה היא הקטע השמאלי', () => {
    expect(inkBoxFor({ text: 'In the beginning', k: 0, boxes: BOXES, ltr: true })).toEqual(BOXES[2])
    expect(inkBoxFor({ text: 'In the beginning', k: 2, boxes: BOXES, ltr: true })).toEqual(BOXES[0])
  })

  it('מספר מילים ≠ מספר קטעים — אין תיבה (מסמנים רק בטקסט)', () => {
    expect(inkBoxFor({ text: 'אמר רבי', k: 0, boxes: BOXES })).toBeNull()
    expect(inkBoxFor({ text: 'אמר רבי יצחק לא', k: 0, boxes: BOXES })).toBeNull()
  })

  it('עברית ולטינית יחד — סדר המילים בתמונה לא ודאי, אין תיבה', () => {
    expect(mixedDirection('אמר Rashi יצחק')).toBe(true)
    expect(mixedDirection('אמר רבי 12')).toBe(false)
    expect(inkBoxFor({ text: 'אמר Rashi יצחק', k: 0, boxes: BOXES })).toBeNull()
  })

  it('אין עדיין קטעים / אין מילים — אין תיבה', () => {
    expect(inkBoxFor({ text: 'אמר רבי יצחק', k: 0, boxes: null })).toBeNull()
    expect(inkBoxFor({ text: 'אמר רבי יצחק', k: 0, boxes: [] })).toBeNull()
    expect(inkBoxFor({ text: '', k: -1, boxes: BOXES })).toBeNull()
  })
})
