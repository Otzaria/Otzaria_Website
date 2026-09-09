import { describe, it, expect } from 'vitest'
import { computeImagePanelWidth, computeColumnWidth, computeOcrCropParams } from './panelResizeGeometry'

const rect = { top: 0, left: 0, right: 1000, bottom: 800, width: 1000, height: 800 }

describe('computeImagePanelWidth', () => {
  it('אנכי, ללא החלפת צדדים: מדידה מהקצה הימני', () => {
    // rect.right - clientX = 1000 - 700 = 300 -> 30%
    expect(computeImagePanelWidth(rect, 700, 0, 'vertical', false)).toBe(30)
  })

  it('אנכי, עם החלפת צדדים: מדידה מהקצה השמאלי', () => {
    // clientX - rect.left = 700 -> 70%
    expect(computeImagePanelWidth(rect, 700, 0, 'vertical', true)).toBe(70)
  })

  it('אופקי, ללא החלפת צדדים: מדידה מהקצה העליון', () => {
    // clientY - rect.top = 400 / 800 -> 50%
    expect(computeImagePanelWidth(rect, 0, 400, 'horizontal', false)).toBe(50)
  })

  it('אופקי, עם החלפת צדדים: מדידה מהקצה התחתון', () => {
    // rect.bottom - clientY = 800 - 200 = 600 / 800 -> 75%
    expect(computeImagePanelWidth(rect, 0, 200, 'horizontal', true)).toBe(75)
  })

  it('קלמפ לגבול תחתון 20%', () => {
    expect(computeImagePanelWidth(rect, 990, 0, 'vertical', false)).toBe(20)
  })

  it('קלמפ לגבול עליון 80%', () => {
    expect(computeImagePanelWidth(rect, 50, 0, 'vertical', false)).toBe(80)
  })

  // טסט רגרסיה: תרחיש קונקרטי מהקוד המקורי (mouseAt X=250, vertical, ללא swap)
  // צריך להישאר 75% תמיד - שינוי בנוסחה ישבור טסט זה.
  it('רגרסיה: תרחיש קונקרטי צריך להישאר יציב', () => {
    expect(computeImagePanelWidth(rect, 250, 0, 'vertical', false)).toBe(75)
  })
})

describe('computeColumnWidth', () => {
  const editorRect = { top: 0, left: 0, right: 600, bottom: 400, width: 600, height: 400 }

  it('מחשב אחוז מהקצה הימני', () => {
    // rect.right - clientX = 600 - 450 = 150 / 600 -> 25%
    expect(computeColumnWidth(editorRect, 450)).toBe(25)
  })

  it('קלמפ לגבול תחתון 10%', () => {
    expect(computeColumnWidth(editorRect, 590)).toBe(10)
  })

  it('קלמפ לגבול עליון 90%', () => {
    expect(computeColumnWidth(editorRect, 10)).toBe(90)
  })

  // טסט רגרסיה: תרחיש קונקרטי מהקוד המקורי
  it('רגרסיה: תרחיש קונקרטי צריך להישאר יציב', () => {
    expect(computeColumnWidth(editorRect, 300)).toBe(50)
  })
})

describe('computeOcrCropParams', () => {
  it('מחשב גודל קנבס כגודל אזור הבחירה', () => {
    const params = computeOcrCropParams({ x: 10, y: 20, width: 100, height: 50 }, 0)
    expect(params.canvasWidth).toBe(100)
    expect(params.canvasHeight).toBe(50)
  })

  it('מחשב זווית סיבוב ברדיאנים מתוך מעלות', () => {
    const params = computeOcrCropParams({ x: 0, y: 0, width: 10, height: 10 }, 90)
    expect(params.rotationRadians).toBeCloseTo(Math.PI / 2)
  })

  it('מחשב מיקום ציור כמינוס מרכז אזור הבחירה', () => {
    const params = computeOcrCropParams({ x: 100, y: 200, width: 40, height: 20 }, 0)
    // selCenterX = 100 + 20 = 120, selCenterY = 200 + 10 = 210
    expect(params.drawX).toBe(-120)
    expect(params.drawY).toBe(-210)
  })

  // טסט רגרסיה: תרחיש קונקרטי מהקוד המקורי
  it('רגרסיה: תרחיש קונקרטי צריך להישאר יציב', () => {
    const params = computeOcrCropParams({ x: 5, y: 5, width: 200, height: 100 }, 180)
    expect(params).toEqual({
      canvasWidth: 200,
      canvasHeight: 100,
      rotationRadians: Math.PI,
      drawX: -105,
      drawY: -55,
    })
  })
})
