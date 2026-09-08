import { describe, it, expect } from 'vitest'
import { escapeRegExp, buildWholeWordRegex } from './hebrewWordUtils'

describe('escapeRegExp', () => {
  it('בורח מכל תווי המטא-קרקטרים של regex', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\')
  })

  it('לא נוגע בתווים רגילים (אותיות עברית/לטינית/ספרות)', () => {
    expect(escapeRegExp('שלום123abc')).toBe('שלום123abc')
  })

  it('מונע מתו מיוחד בקלט משתמש לשבור את ה-regex שנבנה', () => {
    const dangerous = 'a.b'
    const regex = new RegExp(escapeRegExp(dangerous))
    expect(regex.test('a.b')).toBe(true)
    // בלי escape, "." היה תופס גם "axb" — עם escape זה לא קורה
    expect(regex.test('axb')).toBe(false)
  })
})

describe('buildWholeWordRegex', () => {
  it('תופס מילה שלמה כשמוקפת ברווחים', () => {
    const regex = buildWholeWordRegex('שלום')
    expect(regex.test('הלום שלום עולם')).toBe(true)
  })

  it('לא תופס מילה כשהיא חלק ממילה עברית ארוכה יותר (גבול מילה עברי)', () => {
    const regex = buildWholeWordRegex('שלום', false)
    // "בשלום" — "שלום" הוא חלק ממילה עברית ולכן לא גבול מילה תקין בצד שמאל
    expect(regex.test('בשלום')).toBe(false)
  })

  it('לא תופס מילה כשיש לה סיומת עברית צמודה', () => {
    const regex = buildWholeWordRegex('שלום', false)
    // "שלומכם" - יש המשך של אותיות עבריות אחרי ההתאמה
    expect(regex.test('שלומכם')).toBe(false)
  })

  it('תופס מילה בתחילת/סוף מחרוזת', () => {
    const start = buildWholeWordRegex('שלום', false)
    expect(start.test('שלום עולם')).toBe(true)
    const end = buildWholeWordRegex('עולם', false)
    expect(end.test('שלום עולם')).toBe(true)
  })

  it('מטפל בתווים מיוחדים ב-regex בתוך המילה המבוקשת (escape פנימי)', () => {
    const regex = buildWholeWordRegex('a.b', false)
    expect(regex.test('x a.b y')).toBe(true)
    expect(regex.test('x axxb y')).toBe(false)
  })

  it('מילה ריקה/falsy מחזירה null', () => {
    expect(buildWholeWordRegex('')).toBeNull()
    expect(buildWholeWordRegex(undefined)).toBeNull()
  })

  it('הדגל global קובע אם ל-regex יש דגל g', () => {
    const globalRegex = buildWholeWordRegex('שלום', true)
    expect(globalRegex.global).toBe(true)
    const nonGlobalRegex = buildWholeWordRegex('שלום', false)
    expect(nonGlobalRegex.global).toBe(false)
  })

  it('regex גלובלי מוצא את כל המופעים העצמאיים', () => {
    const regex = buildWholeWordRegex('שלום', true)
    const matches = 'שלום שלום ושלום' .match(regex)
    // המופע האחרון ("ושלום") צמוד לאות עברית ולכן אינו גבול מילה
    expect(matches).toHaveLength(2)
  })
})
