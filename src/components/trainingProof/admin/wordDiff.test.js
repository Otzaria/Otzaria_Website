import { describe, it, expect } from 'vitest'
import { wordDiff, changedWords } from './wordDiff'

describe('wordDiff — הבדל ברמת-מילה', () => {
  it('זהה — הכול same', () => {
    expect(wordDiff('אמר רבי יצחק', 'אמר  רבי יצחק ')).toEqual([
      { t: 'אמר', op: 'same' },
      { t: 'רבי', op: 'same' },
      { t: 'יצחק', op: 'same' },
    ])
  })

  it('מילה שהוחלפה ומילה שנוספה', () => {
    const d = wordDiff('אמר רבי יצחק לא', 'אמר רבי יצחק לא היה')
    expect(d.at(-1)).toEqual({ t: 'היה', op: 'ins' })
    const r = wordDiff('אמר רבי יצחק', 'אמר רב יצחק')
    expect(r).toEqual([
      { t: 'אמר', op: 'same' },
      { t: 'רבי', op: 'del' },
      { t: 'רב', op: 'ins' },
      { t: 'יצחק', op: 'same' },
    ])
    expect(changedWords(r)).toBe(2)
  })

  it('ריק מול טקסט', () => {
    expect(wordDiff('', 'א ב')).toEqual([
      { t: 'א', op: 'ins' },
      { t: 'ב', op: 'ins' },
    ])
  })
})
