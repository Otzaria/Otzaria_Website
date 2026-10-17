import { describe, it, expect } from 'vitest'
import { anchorId, lastHeadingAbove, scrollDeltaToReveal } from './scrollSpy'

describe('lastHeadingAbove', () => {
  it('האחרונה שמעל הגבול (סעיפים קצרים בסוף הדף)', () => {
    expect(lastHeadingAbove([-500, 120, 600, 1200], 900)).toBe(2)
  })

  it('אף אחת — -1', () => {
    expect(lastHeadingAbove([1000, 2000], 900)).toBe(-1)
  })
})

describe('scrollDeltaToReveal', () => {
  const box = { top: 100, bottom: 700 }
  it('גלוי — null', () => {
    expect(scrollDeltaToReveal({ top: 300, bottom: 330 }, box)).toBeNull()
  })
  it('מתחת לתחתית — גלילה חיובית עם שוליים', () => {
    expect(scrollDeltaToReveal({ top: 690, bottom: 720 }, box, 24)).toBe(44)
  })
  it('מעל הראש — גלילה שלילית', () => {
    expect(scrollDeltaToReveal({ top: 90, bottom: 120 }, box, 24)).toBe(-34)
  })
})

describe('anchorId', () => {
  it('מפענח עוגן בעברית', () => {
    expect(anchorId(`#${encodeURIComponent('לוח-שנה')}`)).toBe('לוח-שנה')
    expect(anchorId('#intro')).toBe('intro')
    expect(anchorId('/docs/x')).toBe('')
    expect(anchorId('#%E0%A')).toBe('%E0%A')
  })
})
