import { describe, it, expect } from 'vitest'
import { clampPanelPosition, panelWidth, parseSavedPosition, panelMaxHeight, PANEL_MARGIN } from './floatingPanelGeometry'

describe('floatingPanelGeometry', () => {
  it('panelWidth — לא רחב מהחלון פחות המרווחים', () => {
    expect(panelWidth(400, 1440)).toBe(400)
    expect(panelWidth(400, 390)).toBe(390 - PANEL_MARGIN * 2)
  })

  it('clampPanelPosition — מצמיד לגבולות החלון', () => {
    expect(clampPanelPosition({ x: 2000, y: 2000 }, 400, { width: 1440, height: 900 })).toEqual({ x: 1440 - 400 - 16, y: 900 - 120 })
    expect(clampPanelPosition({ x: -50, y: -10 }, 400, { width: 1440, height: 900 })).toEqual({ x: 16, y: 16 })
    expect(clampPanelPosition({ x: 700, y: 100 }, 358, { width: 390, height: 844 })).toEqual({ x: 16, y: 100 })
  })

  it('clampPanelPosition — ערכים חסרים', () => {
    expect(clampPanelPosition(null, 400, { width: 1440, height: 900 })).toEqual({ x: 16, y: 16 })
  })

  it('parseSavedPosition', () => {
    expect(parseSavedPosition('{"x":10,"y":20}')).toEqual({ x: 10, y: 20 })
    expect(parseSavedPosition('{"x":"a"}')).toBeNull()
    expect(parseSavedPosition('not json')).toBeNull()
    expect(parseSavedPosition(null)).toBeNull()
  })

  it('panelMaxHeight — עד 85% ובלי לחרוג מהקצה התחתון', () => {
    expect(panelMaxHeight(16, 1000)).toBe(850)
    expect(panelMaxHeight(600, 1000)).toBe(384)
    expect(panelMaxHeight(990, 1000)).toBe(120)
  })
})
