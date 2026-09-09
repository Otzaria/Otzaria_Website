import { describe, it, expect } from "vitest"
import { clampPoint, computeMovedRect, computeResizedRect } from "./imagePanelGeometry"

describe("clampPoint", () => {
  it("leaves a point inside bounds unchanged", () => {
    expect(clampPoint({ x: 10, y: 20 }, 100, 200)).toEqual({ x: 10, y: 20 })
  })

  it("clamps negative coordinates to zero", () => {
    expect(clampPoint({ x: -5, y: -1 }, 100, 200)).toEqual({ x: 0, y: 0 })
  })

  it("clamps coordinates beyond the max to the max", () => {
    expect(clampPoint({ x: 150, y: 250 }, 100, 200)).toEqual({ x: 100, y: 200 })
  })
})

describe("computeMovedRect", () => {
  const dragStart = { x: 50, y: 50, rectX: 10, rectY: 10, rectW: 30, rectH: 20 }

  it("moves the rect by the drag delta", () => {
    const result = computeMovedRect(dragStart, 60, 55, 200, 200)
    expect(result).toEqual({ x: 20, y: 15, width: 30, height: 20 })
  })

  it("clamps the rect to the left/top edge of the image", () => {
    const result = computeMovedRect(dragStart, 0, 0, 200, 200)
    expect(result).toEqual({ x: 0, y: 0, width: 30, height: 20 })
  })

  it("clamps the rect to the right/bottom edge of the image", () => {
    const result = computeMovedRect(dragStart, 1000, 1000, 100, 80)
    expect(result).toEqual({ x: 70, y: 60, width: 30, height: 20 })
  })

  it("keeps the original width and height unchanged", () => {
    const result = computeMovedRect(dragStart, 55, 52, 200, 200)
    expect(result.width).toBe(30)
    expect(result.height).toBe(20)
  })
})

describe("computeResizedRect", () => {
  const start = { rectX: 20, rectY: 20, rectW: 40, rectH: 30 }

  it("resizes from the se handle by moving the bottom-right corner", () => {
    const result = computeResizedRect("se", start, 80, 70, 10)
    expect(result).toEqual({ x: 20, y: 20, width: 60, height: 50 })
  })

  it("resizes from the nw handle by moving the top-left corner", () => {
    const result = computeResizedRect("nw", start, 10, 10, 10)
    expect(result).toEqual({ x: 10, y: 10, width: 50, height: 40 })
  })

  it("resizes only width from the e handle", () => {
    const result = computeResizedRect("e", start, 100, 999, 10)
    expect(result).toEqual({ x: 20, y: 20, width: 80, height: 30 })
  })

  it("resizes only height from the s handle", () => {
    const result = computeResizedRect("s", start, 999, 90, 10)
    expect(result).toEqual({ x: 20, y: 20, width: 40, height: 70 })
  })

  it("clamps width to the minimum size when dragging past the opposite edge (e handle)", () => {
    const result = computeResizedRect("e", start, 0, 999, 10)
    expect(result.width).toBe(10)
    expect(result.x).toBe(20)
  })

  it("clamps width to the minimum size and keeps the right edge fixed (w handle)", () => {
    const result = computeResizedRect("w", start, 999, 999, 10)
    expect(result.width).toBe(10)
    expect(result.x).toBe(50)
  })

  it("clamps height to the minimum size when dragging past the opposite edge (s handle)", () => {
    const result = computeResizedRect("s", start, 999, 0, 10)
    expect(result.height).toBe(10)
    expect(result.y).toBe(20)
  })

  it("clamps height to the minimum size and keeps the bottom edge fixed (n handle)", () => {
    const result = computeResizedRect("n", start, 999, 999, 10)
    expect(result.height).toBe(10)
    expect(result.y).toBe(40)
  })
})
