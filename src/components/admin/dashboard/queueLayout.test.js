// השורות המאוזנות: אין שורה חלקית עם חור, ואין כרטיס בודד צר.
import { describe, expect, test } from 'vitest'
import { balancedRows, isLongCount, queueSpanClasses } from './queueLayout'

describe('balancedRows', () => {
  test('מחלק כמה שיותר שווה, הגדולות קודם', () => {
    expect(balancedRows(13, 3)).toEqual([3, 3, 3, 2, 2])
    expect(balancedRows(4, 3)).toEqual([2, 2])
    expect(balancedRows(7, 3)).toEqual([3, 2, 2])
    expect(balancedRows(5, 2)).toEqual([2, 2, 1])
    expect(balancedRows(1, 3)).toEqual([1])
    expect(balancedRows(0, 3)).toEqual([])
  })

  test('לכל n עד 30: הסכום נשמר, ושורה לא קטנה ביותר מ-1 מהגדולה', () => {
    for (let n = 1; n <= 30; n++) {
      for (const cols of [2, 3]) {
        const rows = balancedRows(n, cols)
        expect(rows.reduce((a, b) => a + b, 0)).toBe(n)
        expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1)
        expect(Math.max(...rows)).toBeLessThanOrEqual(cols)
      }
    }
  })
})

describe('queueSpanClasses', () => {
  const spans = (n) => Array.from({ length: n }, (_, i) => queueSpanClasses(i, n))
  // כל שורה ב-6 יחידות מתמלאת עד הסוף
  const units = (cls) => ({ '@6xl:col-span-2': 2, '@6xl:col-span-3': 3, '@6xl:col-span-6': 6 })[cls.split(' ')[1]]

  test('כרטיס יחיד — כל הרוחב', () => {
    expect(spans(1)).toEqual(['@3xl:col-span-2 @6xl:col-span-6'])
  })

  test('13 כרטיסים: שלוש שורות של 3, שתיים של 2; ב-2 עמודות האחרון לבד ברוחב מלא', () => {
    const s = spans(13)
    expect(s.slice(0, 9).every((c) => c.includes('@6xl:col-span-2'))).toBe(true)
    expect(s.slice(9).every((c) => c.includes('@6xl:col-span-3'))).toBe(true)
    expect(s[12]).toContain('@3xl:col-span-2')
    expect(s.slice(0, 12).every((c) => c.includes('@3xl:col-span-1'))).toBe(true)
  })

  test('לכל n — סכום היחידות מתחלק ב-6 (אין חור בסוף)', () => {
    for (let n = 1; n <= 30; n++) expect(spans(n).reduce((a, c) => a + units(c), 0) % 6).toBe(0)
  })
})

describe('isLongCount', () => {
  test('מ-100,000 (7 תווים) המספר נחשב ארוך ועובר לשורה משלו כבר ברוחב בינוני', () => {
    expect(isLongCount('99,999')).toBe(false)
    expect(isLongCount('100,000')).toBe(true)
    expect(isLongCount('1,234,567')).toBe(true)
    expect(isLongCount('—')).toBe(false)
  })
})
