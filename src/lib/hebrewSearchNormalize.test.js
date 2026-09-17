import { describe, it, expect } from 'vitest'
import { normalizeHebrew, tokenizeHebrew, expandTermVariants, STRIP_HEBREW_PREFIXES } from './hebrewSearchNormalize'

// הדוגמאות בראש הקובץ מתפקדות שם כ"בדיקות ידניות" — כאן הן הופכות לבדיקות אמיתיות,
// כדי שסטייה מהתנהגות המתועדת (למשל שינוי בטעות בסדר הפעלות הניקוי) תיתפס מיד.
describe('normalizeHebrew', () => {
  it('מסיר ניקוד וטעמים', () => {
    expect(normalizeHebrew('גִּימַטְרִיָּה')).toBe('גימטריה')
    // הערה: הקלט 'שֻׁלְחָן' מורכב מהאותיות ש-ל-ח-ן בלבד (הקובוץ הוא ניקוד, לא אות ו')
    // ולכן התוצאה היא 'שלחנ' ולא 'שולחנ' כפי שנכתב (ככל הנראה בטעות) בהערת התיעוד
    // שבראש הקובץ — ראו דיווח בסיכום המשימה.
    expect(normalizeHebrew('שֻׁלְחָן עָרוּךְ')).toBe('שלחנ ערוכ')
  })

  it('מסיר גרש/גרשיים בכל הצורות המקובלות', () => {
    expect(normalizeHebrew('ר"ת ותוס׳')).toBe('רת ותוס')
    expect(normalizeHebrew(`רמב”ם וגו’`)).toBe('רמבמ וגו')
  })

  it('ממיר אותיות סופיות לצורתן הרגילה', () => {
    expect(normalizeHebrew('שלום')).toBe('שלומ')
    expect(normalizeHebrew('בין השמשות')).toBe('בינ השמשות')
    expect(normalizeHebrew('ארץ')).toBe('ארצ')
    expect(normalizeHebrew('כף')).toBe('כפ')
    expect(normalizeHebrew('לחן')).toBe('לחנ')
    expect(normalizeHebrew('ילך')).toBe('ילכ')
  })

  it('הופך לאותיות קטנות עבור טקסט לטיני', () => {
    expect(normalizeHebrew('Hello World')).toBe('hello world')
  })

  it('מצמצם תווים לא-אות/ספרה לרווח בודד וחותך קצוות', () => {
    expect(normalizeHebrew('  שלום,  עולם!! ')).toBe('שלומ עולמ')
    expect(normalizeHebrew('a-b_c')).toBe('a b c')
  })

  it('שומר על ספרות', () => {
    expect(normalizeHebrew('פרק 5 הלכה 10')).toBe('פרק 5 הלכה 10')
  })

  it('מטפל בערכים ריקים/falsy מבלי לזרוק', () => {
    expect(normalizeHebrew('')).toBe('')
    expect(normalizeHebrew(null)).toBe('')
    expect(normalizeHebrew(undefined)).toBe('')
    expect(normalizeHebrew(0)).toBe('')
  })

  it('מקבל ערכים לא-מחרוזתיים ומכריח אותם למחרוזת', () => {
    expect(normalizeHebrew(123)).toBe('123')
  })
})

describe('tokenizeHebrew', () => {
  it('מפרק טקסט למונחים מנורמלים ללא רווחים ריקים', () => {
    expect(tokenizeHebrew('שֻׁלְחָן עָרוּךְ')).toEqual(['שלחנ', 'ערוכ'])
  })

  it('מחרוזת ריקה מחזירה מערך ריק (לא [""])', () => {
    expect(tokenizeHebrew('')).toEqual([])
    expect(tokenizeHebrew('   ')).toEqual([])
  })
})

describe('expandTermVariants', () => {
  it('כולל תמיד את המונח המקורי', () => {
    expect(expandTermVariants('לגימטריה')).toEqual(['לגימטריה', 'גימטריה'])
  })

  it('מכווץ י/ו כפולות (כתיב מלא ↔ מקובל) — הפונקציה מקבלת קלט מנורמל (אחרי normalizeHebrew, ולכן עם מ רגילה ולא ם סופית)', () => {
    expect(expandTermVariants('חיימ')).toEqual(['חיימ', 'חימ'])
  })

  it('מסיר אות תחילית שימוש למילים באורך 4 ומעלה בלבד', () => {
    // "בבית" — אורך 4, אות תחילית ב' — מקבל וריאנט ללא תחילית
    expect(expandTermVariants('בבית')).toEqual(['בבית', 'בית'])
    // "בית" — אורך 3 — לא מתעדים גזירה למרות שמתחיל באות תחילית
    expect(expandTermVariants('בית')).toEqual(['בית'])
  })

  it('לא מסיר תחילית כשהאות הראשונה אינה אחת מאותיות השימוש', () => {
    expect(expandTermVariants('דוגמא')).toEqual(['דוגמא'])
  })

  it('מונח ריק/falsy מחזיר מערך ריק', () => {
    expect(expandTermVariants('')).toEqual([])
    expect(expandTermVariants(undefined)).toEqual([])
  })

  it('כאשר STRIP_HEBREW_PREFIXES כבוי לא היה מוסיף גרסה ללא תחילית (בדיקת קונפיגורציה)', () => {
    // בדיקה תיעודית: הדגל צריך להיות true כברירת מחדל בקוד הנוכחי.
    expect(STRIP_HEBREW_PREFIXES).toBe(true)
  })

  it('משלב כיווץ י/ו יחד עם הסרת תחילית כאשר שניהם רלוונטיים', () => {
    // "וחיימ" (קלט מנורמל) - אורך 5, תחילית ו', לאחר הסרה "חיימ" מתכווץ ל"חימ"
    const variants = expandTermVariants('וחיימ')
    expect(variants).toContain('וחיימ')
    expect(variants).toContain('וחימ')
    expect(variants).toContain('חיימ')
    expect(variants).toContain('חימ')
    expect(variants).toHaveLength(4)
  })
})
