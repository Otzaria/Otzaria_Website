import { describe, it, expect } from 'vitest'
import { splitByInk, otsu, toGray } from './splitInk'

// שורה סינתטית: רקע לבן, "אותיות" שחורות כמלבנים. רווח צר = בין אותיות, רווח רחב = בין מילים.
function line(w, h, blobs) {
  const g = new Uint8Array(w * h).fill(255)
  for (const [x0, x1, y0 = 4, y1 = h - 4] of blobs) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * w + x] = 10
  }
  return g
}

describe('splitByInk', () => {
  it('שלוש מילים, מימין לשמאל; אותיות צמודות באותה מילה', () => {
    // מילה שמאלית: 10–30 ו-32–40 (רווח 2 = בין אותיות); אמצעית 60–90; ימנית 120–150
    const g = line(160, 30, [[10, 30], [32, 40], [60, 90], [120, 150]])
    const boxes = splitByInk(g, 160, 30)
    expect(boxes).toEqual([
      [120, 4, 150, 26],
      [60, 4, 90, 26],
      [10, 4, 40, 26],
    ])
  })

  it('גובה הדיו של כל מילה בנפרד', () => {
    const g = line(100, 40, [[10, 30, 10, 20], [60, 90, 2, 38]])
    const [right, left] = splitByInk(g, 100, 40)
    expect(right).toEqual([60, 2, 90, 38])
    expect(left).toEqual([10, 10, 30, 20])
  })

  it('שורה ריקה — אין מילים; קלט לא תקין — אין מילים', () => {
    expect(splitByInk(new Uint8Array(50 * 10).fill(255), 50, 10)).toEqual([])
    expect(splitByInk(new Uint8Array(3), 50, 10)).toEqual([])
  })

  it('כתם דק מאוד (פחות מ-2 פיקסלים) — לא מילה', () => {
    const g = line(100, 30, [[10, 11], [50, 80]])
    expect(splitByInk(g, 100, 30)).toEqual([[50, 4, 80, 26]])
  })
})

describe('otsu / toGray', () => {
  it('סף בין שחור ללבן', () => {
    const g = new Uint8Array([0, 0, 0, 255, 255, 255])
    const t = otsu(g)
    expect(t).toBeGreaterThanOrEqual(0)
    expect(t).toBeLessThan(255)
  })
  it('RGBA → אפור; שקוף = לבן', () => {
    expect(Array.from(toGray(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]), 2, 1))).toEqual([0, 255])
  })
})
