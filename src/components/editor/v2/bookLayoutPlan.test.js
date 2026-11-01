import { describe, expect, it } from 'vitest'
import { BOOK_EPS, clusterRows, firstWordSpan, scoreTail, stepOk, stepPolygon, tailCandidates } from './bookLayoutPlan'

describe('clusterRows', () => {
  it('מקבץ מלבנים לשורות מסך לפי המרכז האנכי, מלמעלה למטה', () => {
    const rows = clusterRows([
      { top: 40, bottom: 60, left: 10, right: 50 },
      { top: 2, bottom: 22, left: 100, right: 300 },
      { top: 4, bottom: 20, left: 20, right: 90 },
      { top: 41, bottom: 59, left: 60, right: 200 }
    ], 30)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ l: 20, r: 300 })
    expect(rows[1]).toMatchObject({ l: 10, r: 200 })
  })

  it('מתעלם ממלבנים ריקים (רוחב/גובה 0)', () => {
    expect(clusterRows([{ top: 0, bottom: 20, left: 5, right: 5 }, { top: 5, bottom: 5, left: 0, right: 9 }], 30)).toEqual([])
  })

  it('טקסט קטן בשורה לא מזיז את מרכזה (חציון)', () => {
    const rows = clusterRows([
      { top: 0, bottom: 30, left: 0, right: 10 },
      { top: 0, bottom: 30, left: 10, right: 20 },
      { top: 12, bottom: 26, left: 20, right: 30 }
    ], 30)
    expect(rows[0].c).toBe(15)
  })
})

describe('firstWordSpan', () => {
  it('המילה הראשונה עם הרווח שאחריה, עד תחילת השנייה', () => {
    expect(firstWordSpan('שבועת הדיינין, וביאר')).toEqual({ start: 0, wordEnd: 5, end: 6 })
    expect(firstWordSpan('  שם.  ד"ה')).toEqual({ start: 2, wordEnd: 5, end: 7 })
  })
  it('מילה אחת בלבד / ריק — null', () => {
    expect(firstWordSpan('מילה')).toBeNull()
    expect(firstWordSpan('מילה ')).toBeNull()
    expect(firstWordSpan('')).toBeNull()
  })
})

describe('tailCandidates', () => {
  it('פסקה ארוכה עם שורה אחרונה כמעט ריקה — מועמדים בטווח, הראשון קרוב ליעד', () => {
    const c = tailCandidates(10, 0.1, 3, 14)
    expect(c.length).toBeGreaterThan(0)
    for (const x of c) {
      expect(stepOk(x.k, x.s)).toBe(true)
      expect(10 - x.m + 1).toBeGreaterThanOrEqual(3)
    }
    expect(Math.abs(c[0].k - c[0].target)).toBeLessThanOrEqual(1)
  })
  it('שורה אחת — אין סיומת', () => {
    expect(tailCandidates(1, 0.5, 1, 12)).toEqual([])
  })
  it('עם חלון: הסיומת לא מתחילה לפני השורה השלישית', () => {
    expect(tailCandidates(2, 0.4, 3, 12)).toEqual([])
    for (const x of tailCandidates(4, 0.4, 3, 12)) expect(4 - x.m + 1).toBeGreaterThanOrEqual(3)
  })
  it('לוח צר (מעט מילים בשורה) — יעד של שתי שורות', () => {
    const c = tailCandidates(12, 0.3, 1, 6)
    expect(c.length).toBeGreaterThan(0)
    for (const x of c) expect(x.target).toBe(2)
  })
  it('לוח צר מאוד — בלי משפך', () => {
    expect(tailCandidates(12, 0.3, 1, 4.5)).toEqual([])
  })
})

describe('scoreTail', () => {
  const c = { k: 3, s: 0.13, target: 3 }
  it('יותר שורות מהצפוי — פסול', () => {
    expect(scoreTail(c, { start: 5, rows: 9, lastFill: 0.8, gapEm: 0.3 }).sc).toBeGreaterThanOrEqual(100)
  })
  it('צורה מלאה, שורה אחרונה מלאה ורווחים סבירים — ניקוד נמוך', () => {
    const r = scoreTail(c, { start: 5, rows: 8, lastFill: 0.8, gapEm: 0.3 })
    expect(r.used).toBe(3)
    expect(r.sc).toBeLessThan(0.5)
  })
  it('שורה אחרונה כמעט ריקה ורווחים מתוחים — ניקוד גבוה יותר', () => {
    const good = scoreTail(c, { start: 5, rows: 8, lastFill: 0.8, gapEm: 0.3 }).sc
    expect(scoreTail(c, { start: 5, rows: 8, lastFill: 0.1, gapEm: 0.3 }).sc).toBeGreaterThan(good + 5)
    expect(scoreTail(c, { start: 5, rows: 8, lastFill: 0.8, gapEm: 1 }).sc).toBeGreaterThan(good + 5)
  })
})

describe('stepPolygon', () => {
  it('צד ימין: נכנס משמאל לקצה הימני, מדרגה לכל שורה (מוזחת ב-EPS)', () => {
    expect(stepPolygon('right', 40, 10, 2, 30)).toBe(
      `polygon(40px ${BOOK_EPS}px,30px ${BOOK_EPS}px,30px 30px,20px ${30 + BOOK_EPS}px,20px 60px,40px 60px)`
    )
  })
  it('צד שמאל: נכנס מימין לקצה השמאלי', () => {
    expect(stepPolygon('left', 40, 10, 1, 30, 0)).toBe('polygon(0px 0px,10px 0px,10px 30px,0px 30px)')
  })
})
