import { describe, expect, it } from 'vitest'
import { contextMenuPosition } from './contextMenuGeometry'

const base = { width: 200, height: 150, viewportWidth: 1000, viewportHeight: 800 }

describe('contextMenuPosition', () => {
  it('בימין-לשמאל נפתח משמאל לנקודה ומתחתיה', () => {
    expect(contextMenuPosition({ ...base, x: 500, y: 300 })).toEqual({ left: 300, top: 300 })
  })

  it('משמאל-לימין נפתח מימין לנקודה', () => {
    expect(contextMenuPosition({ ...base, x: 500, y: 300, rtl: false })).toEqual({ left: 500, top: 300 })
  })

  it('אין מקום משמאל — מתהפך לימין הנקודה', () => {
    expect(contextMenuPosition({ ...base, x: 100, y: 300 })).toEqual({ left: 100, top: 300 })
  })

  it('אין מקום למטה — נפתח מעל הנקודה', () => {
    expect(contextMenuPosition({ ...base, x: 500, y: 750 })).toEqual({ left: 300, top: 600 })
  })

  it('אין מקום לשום צד — נדחק פנימה ונשאר בתוך המסך', () => {
    const pos = contextMenuPosition({ ...base, x: 150, y: 100, viewportWidth: 300, viewportHeight: 200 })
    expect(pos.left).toBeGreaterThanOrEqual(8)
    expect(pos.left + 200).toBeLessThanOrEqual(300 - 8 + 0.001)
    expect(pos.top).toBeGreaterThanOrEqual(8)
  })

  it('תפריט גדול מהמסך — נצמד לשוליים', () => {
    expect(contextMenuPosition({ ...base, x: 50, y: 50, width: 500, height: 900, viewportWidth: 300, viewportHeight: 400 }))
      .toEqual({ left: 8, top: 8 })
  })

  it('ערכים חסרים לא שוברים', () => {
    expect(contextMenuPosition({ x: undefined, y: null, width: 0, height: 0, viewportWidth: 100, viewportHeight: 100 }))
      .toEqual({ left: 8, top: 8 })
  })
})
