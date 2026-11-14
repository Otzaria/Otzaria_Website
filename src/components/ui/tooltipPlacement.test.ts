import { describe, expect, it } from 'vitest'
import { shouldSkipDelay, tooltipSide } from './tooltipPlacement'

describe('tooltipSide', () => {
  const base = { height: 30, gap: 10, viewportHeight: 720 }

  it('מתחת לרכיב כשיש מקום', () => {
    expect(tooltipSide({ ...base, anchorTop: 100, anchorBottom: 132 })).toBe('bottom')
  })

  it('מתהפך למעלה כשאין מקום מתחת (שורת המצב בתחתית)', () => {
    expect(tooltipSide({ ...base, anchorTop: 692, anchorBottom: 720 })).toBe('top')
  })

  it('כשאין מקום באף צד — הצד הגדול יותר', () => {
    expect(tooltipSide({ height: 100, gap: 10, viewportHeight: 150, anchorTop: 20, anchorBottom: 50 })).toBe('bottom')
    expect(tooltipSide({ height: 100, gap: 10, viewportHeight: 150, anchorTop: 90, anchorBottom: 120 })).toBe('top')
  })
})

describe('shouldSkipDelay', () => {
  it('מיד אחרי סגירת רמז שכן — בלי השהיה', () => {
    expect(shouldSkipDelay(1000, 700)).toBe(true)
  })
  it('אחרי זמן, או כשלא נפתח רמז קודם — עם השהיה', () => {
    expect(shouldSkipDelay(2000, 700)).toBe(false)
    expect(shouldSkipDelay(2000, 0)).toBe(false)
  })
})
