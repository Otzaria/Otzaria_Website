import { describe, expect, it } from 'vitest'
import { foreverShift } from './foreverTaglineLogic'

describe('foreverShift', () => {
  it('חצי מרוחב "לנצח!" ועוד חצי רווח', () => {
    expect(foreverShift(80, 10)).toBe(45)
    expect(foreverShift(81, 8)).toBe(44.5)
  })

  it('לפני מדידה (רוחב 0) — בלי הזזה; רווח שלילי נחשב 0', () => {
    expect(foreverShift(0, 10)).toBe(0)
    expect(foreverShift(80, -5)).toBe(40)
  })
})
