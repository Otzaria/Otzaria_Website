import { describe, it, expect } from 'vitest'
import { narrowColumns, startsNarrowRow, NARROW_WRAP_FROM } from './heroStatsLayout'

describe('heroStatsLayout', () => {
  it('מתחת לסף — שורה אחת עם כל הפריטים', () => {
    expect(narrowColumns(1)).toBe(1)
    expect(narrowColumns(NARROW_WRAP_FROM - 1)).toBe(NARROW_WRAP_FROM - 1)
  })

  it('מהסף ומעלה — שתי שורות, העליונה מלאה: 5 → 3+2, 4 → 2+2', () => {
    expect(narrowColumns(5)).toBe(3)
    expect(narrowColumns(4)).toBe(2)
  })

  it('ריק — לא מחלקים באפס', () => {
    expect(narrowColumns(0)).toBe(1)
  })

  it('פותחי השורות — הראשון בכל שורה (בלי קו הפרדה)', () => {
    expect([0, 1, 2, 3, 4].map((i) => startsNarrowRow(i, 5))).toEqual([true, false, false, true, false])
    expect([0, 1, 2].map((i) => startsNarrowRow(i, 3))).toEqual([true, false, false])
  })
})
