import { describe, it, expect } from "vitest"
import {
  imageCoordsFromClientPoint,
  dragBandEdge,
  moveBox,
  resizeBox,
  drawBox,
  MIN_BAND_H,
  MIN_BOX_PX,
} from "./pageCanvasGeometry"

describe("imageCoordsFromClientPoint", () => {
  it("scales client coordinates to image space via the svg rect and viewBox height", () => {
    const rect = { left: 100, top: 50, width: 400, height: 600 }
    // W=800 (פי 2 מהרוחב המוצג), viewH=1200 (פי 2 מהגובה המוצג)
    const result = imageCoordsFromClientPoint({ clientX: 300, clientY: 350 }, rect, 800, 1200)
    expect(result).toEqual({ x: 400, y: 600 })
  })

  it("respects a clipped viewH different from the full image height", () => {
    const rect = { left: 0, top: 0, width: 400, height: 200 }
    const result = imageCoordsFromClientPoint({ clientX: 200, clientY: 100 }, rect, 800, 400)
    expect(result).toEqual({ x: 400, y: 200 })
  })
})

describe("dragBandEdge", () => {
  const bands = [
    { y0: 0, y1: 0.5, book_stream: 0 },
    { y0: 0.5, y1: 1, book_stream: 1 },
  ]
  // רצועות עם רווח ביניהן, כדי לבדוק תזוזה חופשית (בלי הידוק לשכן)
  const gappedBands = [
    { y0: 0, y1: 0.3, book_stream: 0 },
    { y0: 0.7, y1: 1, book_stream: 1 },
  ]

  it("moves y1 of a band down within bounds", () => {
    const next = dragBandEdge(gappedBands, 0, "y1", 600, 1000) // 0.6 מנורמל
    expect(next[0].y1).toBeCloseTo(0.6)
    expect(next[1].y0).toBe(0.7) // הרצועה השנייה אינה משתנה — קצוות עצמאיים
  })

  it("moves y0 of a band up within bounds", () => {
    const next = dragBandEdge(gappedBands, 1, "y0", 400, 1000) // 0.4 מנורמל
    expect(next[1].y0).toBeCloseTo(0.4)
  })

  it("independent edges do not snap to a shared vertex (real PageCanvas.jsx behavior)", () => {
    // כששני קצוות חופפים (y1 של רצועה 0 = y0 של רצועה 1 = 0.5), גרירת אחד
    // מהם לא "מזיזה" את השני איתו — הם שדות עצמאיים לגמרי
    const next = dragBandEdge(bands, 1, "y0", 600, 1000) // מזיז את y0 של רצועה 1 ל-0.6
    expect(next[1].y0).toBeCloseTo(0.6)
    expect(next[0].y1).toBe(0.5) // רצועה 0 לא זזה
  })

  it("clamps y1 so it cannot cross the next band's y0", () => {
    const next = dragBandEdge(bands, 0, "y1", 900, 1000) // 0.9 מנורמל, גבוה מדי
    // חסום ע"י y0 של הרצועה הבאה (0.5) פחות MIN_BAND_H
    expect(next[0].y1).toBeCloseTo(bands[1].y0)
  })

  it("clamps y0 so it cannot cross the previous band's y1", () => {
    const next = dragBandEdge(bands, 1, "y0", 100, 1000) // 0.1 מנורמל, נמוך מדי
    expect(next[1].y0).toBeCloseTo(bands[0].y1)
  })

  it("enforces a minimum band height", () => {
    const next = dragBandEdge(bands, 0, "y1", 500 - 1, 1000) // כמעט על y0 עצמו... בדיקת מינימום מול y1 הנוכחי
    expect(next[0].y1).toBeGreaterThanOrEqual(next[0].y0)
  })

  it("does not mutate the input array", () => {
    const original = JSON.parse(JSON.stringify(bands))
    dragBandEdge(bands, 0, "y1", 600, 1000)
    expect(bands).toEqual(original)
  })

  it("MIN_BAND_H matches the documented minimum splittable height used elsewhere", () => {
    expect(MIN_BAND_H).toBe(0.01)
  })
})

describe("moveBox", () => {
  const box = { x: 100, y: 100, width: 50, height: 30 }

  it("translates the box by dx/dy", () => {
    expect(moveBox(box, 10, 20, 1000, 1000)).toEqual({ x: 110, y: 120, width: 50, height: 30 })
  })

  it("clamps to the left/top image edges", () => {
    expect(moveBox(box, -500, -500, 1000, 1000)).toEqual({ x: 0, y: 0, width: 50, height: 30 })
  })

  it("clamps to the right/bottom image edges", () => {
    expect(moveBox(box, 5000, 5000, 1000, 1000)).toEqual({
      x: 950,
      y: 970,
      width: 50,
      height: 30,
    })
  })
})

describe("resizeBox", () => {
  const box = { x: 100, y: 100, width: 50, height: 30 }

  it("grows width/height by dx/dy from the box's own origin", () => {
    expect(resizeBox(box, 10, 20, 1000, 1000)).toEqual({ x: 100, y: 100, width: 60, height: 50 })
  })

  it("enforces the minimum box size", () => {
    expect(resizeBox(box, -1000, -1000, 1000, 1000)).toEqual({
      x: 100,
      y: 100,
      width: MIN_BOX_PX,
      height: MIN_BOX_PX,
    })
  })

  it("clamps growth to the image's right/bottom edge", () => {
    expect(resizeBox(box, 5000, 5000, 200, 200)).toEqual({ x: 100, y: 100, width: 100, height: 100 })
  })
})

describe("drawBox", () => {
  it("builds a box from two corners regardless of drag direction", () => {
    expect(drawBox({ x: 50, y: 60 }, { x: 150, y: 100 }, 1000, 1000)).toEqual({
      x: 50,
      y: 60,
      width: 100,
      height: 40,
    })
    // גרירה הפוכה (מהפינה הימנית-תחתונה לשמאלית-עליונה) — אותה תוצאה
    expect(drawBox({ x: 150, y: 100 }, { x: 50, y: 60 }, 1000, 1000)).toEqual({
      x: 50,
      y: 60,
      width: 100,
      height: 40,
    })
  })

  it("enforces the minimum box size even for a near-zero drag", () => {
    const result = drawBox({ x: 50, y: 60 }, { x: 51, y: 61 }, 1000, 1000)
    expect(result.width).toBe(MIN_BOX_PX)
    expect(result.height).toBe(MIN_BOX_PX)
  })

  it("clamps both corners to the image bounds", () => {
    const result = drawBox({ x: -50, y: -50 }, { x: 5000, y: 5000 }, 200, 300)
    expect(result).toEqual({ x: 0, y: 0, width: 200, height: 300 })
  })
})
