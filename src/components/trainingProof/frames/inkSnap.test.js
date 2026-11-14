import { describe, it, expect } from 'vitest'
import { inkGrids, snapBox, snapProposal, otsu, grayOf, analyzeSize, CELL } from './inkSnap'

// הצמדה לדיו (ה-10) כפונקציה טהורה, על עמוד מצויר: גוש-טקסט של "אותיות" (מלבנים קטנים בשורות),
// כתם בודד, ואיור. בודקים שהמסגרת נצמדת לאותיות ולא לכתם, שאובייקט נצמד לאיור, ושבשינוי-גודל
// זז רק הקצה שנגרר.

const W = 480
const H = 640

function page({ text = [100, 100, 300, 300], speck = [50, 50], figure = null } = {}) {
  const g = new Uint8Array(W * H).fill(235)
  const rect = (x0, y0, x1, y1, v = 20) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g[y * W + x] = v
  }
  if (text) {
    const [tx0, ty0, tx1, ty1] = text
    for (let y = ty0; y + 12 <= ty1; y += 20) for (let x = tx0; x + 8 <= tx1; x += 12) rect(x, y, x + 8, y + 12)
  }
  if (speck) rect(speck[0], speck[1], speck[0] + 2, speck[1] + 2)
  if (figure) rect(...figure)
  return g
}

const grid = (g) => inkGrids(g, W, H, 1, W, H)
const near = (a, b, tol = CELL + 4) => Math.abs(a - b) <= tol

describe('inkSnap', () => {
  it('otsu — סף בין שני גוונים', () => {
    const hist = new Float64Array(256)
    hist[20] = 100
    hist[235] = 900
    const t = otsu(hist, 1000)
    expect(t).toBeGreaterThan(20)
    expect(t).toBeLessThanOrEqual(236)
  })

  it('grayOf — ממוצע RGB', () => {
    expect(Array.from(grayOf(Uint8Array.from([30, 60, 90, 255, 255, 255, 255, 255])))).toEqual([60, 255])
  })

  it('analyzeSize — תמונה רחבה מוקטנת לרוחב-הניתוח', () => {
    expect(analyzeSize(2800, 4000)).toEqual({ w: 1400, h: 2000, s: 0.5 })
    expect(analyzeSize(1000, 1400)).toEqual({ w: 1000, h: 1400, s: 1 })
  })

  it('מסגרת רחבה מדי נצמדת לגוש-הטקסט, והכתם שבתוכה לא מושך אותה', () => {
    const G = grid(page())
    const [x0, y0, x1, y1] = snapBox(G, [40, 40, 360, 360], { pageH: H })
    expect(near(x0, 100)).toBe(true)
    expect(near(y0, 100)).toBe(true)
    expect(near(x1, 296)).toBe(true) // האות האחרונה בשורה מסתיימת ב-296
    expect(near(y1, 292)).toBe(true) // השורה האחרונה מסתיימת ב-292
  })

  it('מסגרת צרה מדי מתרחבת אל הרווח הלבן הקרוב (לא חותכת אותיות)', () => {
    const G = grid(page())
    const [x0, y0, x1, y1] = snapBox(G, [106, 104, 290, 288], { pageH: H })
    expect(x0).toBeLessThanOrEqual(100)
    expect(y0).toBeLessThanOrEqual(100)
    expect(x1).toBeGreaterThanOrEqual(296)
    expect(y1).toBeGreaterThanOrEqual(292)
  })

  it('בשינוי-גודל זזים רק הקצוות שנגררו', () => {
    const G = grid(page())
    const out = snapBox(G, [40, 40, 360, 360], { pageH: H, sides: { l: false, t: false, r: false, b: true } })
    expect(out.slice(0, 3)).toEqual([40, 40, 360])
    expect(near(out[3], 292)).toBe(true)
  })

  it('מסגרת-אובייקט נצמדת לאיור', () => {
    const G = grid(page({ text: null, speck: null, figure: [150, 380, 330, 560] }))
    const [x0, y0, x1, y1] = snapBox(G, [110, 340, 400, 620], { isObj: true, pageH: H })
    expect(near(x0, 150)).toBe(true)
    expect(near(y0, 380)).toBe(true)
    expect(near(x1, 330)).toBe(true)
    expect(near(y1, 560)).toBe(true)
  })

  it('מסגרת על מקום ריק, ובלי רשת — נשארת כמות-שהיא (מעוגלת)', () => {
    const G = grid(page())
    expect(snapBox(G, [350.4, 400.6, 450, 600], { pageH: H })).toEqual([350, 401, 450, 600])
    expect(snapBox(null, [10.2, 20.7, 30, 40])).toEqual([10, 21, 30, 40])
  })

  it('התוצאה לעולם לא יוצאת מהעמוד', () => {
    const G = grid(page({ text: [4, 4, 200, 120] }))
    const [x0, y0] = snapBox(G, [0, 0, 260, 200], { pageH: H })
    expect(x0).toBeGreaterThanOrEqual(0)
    expect(y0).toBeGreaterThanOrEqual(0)
  })

  it('הצעת המודל בטעינה: נצמדת כרגיל, אבל לא מתכווצת ליותר ממחצית', () => {
    const G = grid(page())
    const ok = snapProposal(G, [60, 60, 340, 340], { pageH: H })
    expect(near(ok[0], 100)).toBe(true)
    // מסגרת גדולה בהרבה מהגוש — הייתה מאבדת יותר ממחצית הגובה: נשארת
    expect(snapProposal(G, [90, 90, 310, 620], { pageH: H })).toEqual([90, 90, 310, 620])
  })
})
