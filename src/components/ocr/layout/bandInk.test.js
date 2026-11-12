import { describe, expect, it } from 'vitest'
import { bandInk, contrast } from './bandInk'
import { STREAM_COLORS, streamColor } from './PageCanvas'

describe('bandInk — ספרה קריאה על עיגול הרצועה', () => {
  it('כל צבעי הזרמים (ו"לא משויך") — ניגודיות 4.5 לפחות', () => {
    for (const bg of [...STREAM_COLORS, streamColor(null)]) expect(bandInk(bg).ratio).toBeGreaterThanOrEqual(4.5)
  })
  it('כתום — ספרה שחורה (לבן שם רק ~3:1); כחול — לבנה', () => {
    expect(contrast('#d97706', '#ffffff')).toBeLessThan(4.5)
    expect(bandInk('#d97706').color).toBe('var(--ref-neutral-0)')
    expect(bandInk('#2563eb').color).toBe('var(--ref-neutral-100)')
  })
})
