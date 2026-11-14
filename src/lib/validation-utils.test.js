import { describe, it, expect } from 'vitest'
import { validatePassword, validateEmail, normalizeEmailInput, storedEmailPattern } from './validation-utils'

describe('validatePassword', () => {
  it('דוחה סיסמה ריקה/falsy', () => {
    expect(validatePassword('')).toEqual({ isValid: false, error: 'סיסמה נדרשת' })
    expect(validatePassword(undefined)).toEqual({ isValid: false, error: 'סיסמה נדרשת' })
  })

  it('דוחה סיסמה קצרה מהאורך המינימלי (ברירת מחדל 8)', () => {
    const result = validatePassword('1234567')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('8')
  })

  it('מקבלת סיסמה בדיוק באורך המינימלי (גבול כולל)', () => {
    expect(validatePassword('12345678').isValid).toBe(true)
  })

  it('מכבדת minLength מותאם אישית', () => {
    expect(validatePassword('1234', 4).isValid).toBe(true)
    expect(validatePassword('123', 4).isValid).toBe(false)
  })

  it('מחזירה error ריק כשתקין', () => {
    expect(validatePassword('longenoughpassword')).toEqual({ isValid: true, error: '' })
  })
})

describe('validateEmail', () => {
  it('דוחה אימייל ריק/falsy', () => {
    expect(validateEmail('')).toEqual({ isValid: false, error: 'דוא"ל נדרש' })
    expect(validateEmail(undefined)).toEqual({ isValid: false, error: 'דוא"ל נדרש' })
  })

  it('מקבלת כתובת תקינה בסיסית', () => {
    expect(validateEmail('user@example.com')).toEqual({ isValid: true, error: '' })
  })

  it('דוחה כתובת ללא @ או ללא נקודה בדומיין', () => {
    expect(validateEmail('userexample.com').isValid).toBe(false)
    expect(validateEmail('user@examplecom').isValid).toBe(false)
  })

  it('דוחה כתובת עם רווחים', () => {
    expect(validateEmail('user name@example.com').isValid).toBe(false)
    expect(validateEmail('user@exa mple.com').isValid).toBe(false)
  })

  it('דוחה כתובת ארוכה מ-254 תווים לפני בדיקת ה-regex (הגנת ReDoS)', () => {
    const longLocalPart = 'a'.repeat(300)
    const result = validateEmail(`${longLocalPart}@example.com`)
    expect(result).toEqual({ isValid: false, error: 'דוא"ל אינו תקין' })
  })

  it('מקבלת כתובת בדיוק באורך 254 תווים אם תקינה מבחינת התבנית', () => {
    // 254 = local(242) + '@' + 'example.com'(11) = 254
    const local = 'a'.repeat(242)
    const email = `${local}@example.com`
    expect(email.length).toBe(254)
    expect(validateEmail(email).isValid).toBe(true)
  })

  it('לא נתקעת (ReDoS) על קלט פתולוגי ארוך — מסתיימת במהירות', () => {
    // קלט קלאסי שידוע כבעייתי מול regex תאוותניים לא-חסומים: הרבה תווים חוזרים
    // ללא @, כך שבמימוש נאיבי היה עלול לגרום ל-backtracking אקספוננציאלי.
    const pathological = 'a'.repeat(100000) + '!'
    const start = Date.now()
    const result = validateEmail(pathological)
    const elapsed = Date.now() - start
    expect(result.isValid).toBe(false)
    expect(elapsed).toBeLessThan(1000)
  })
})

describe('normalizeEmailInput', () => {
  const rtlWrapped = (text) => String.fromCodePoint(0x202b) + text + String.fromCodePoint(0x202c)

  it('מסירה סימוני כיוון ותווים ברוחב אפס שנדבקו בהעתקה מטקסט RTL', () => {
    expect(normalizeEmailInput(rtlWrapped('user@gmail.com'))).toBe('user@gmail.com')
    for (const cp of [0x061c, 0x2060, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff]) {
      const ch = String.fromCodePoint(cp)
      expect(normalizeEmailInput(`${ch} us${ch}er@example.com${ch} `), cp.toString(16)).toBe('user@example.com')
    }
  })

  it('storedEmailPattern: תואמת כתובת שמורה עטופה בסימונים, בלי תווים מיוחדים של regex', () => {
    const pattern = storedEmailPattern(rtlWrapped('a.b+c@example.com'))
    expect(pattern.test('a.b+c@example.com')).toBe(true)
    expect(pattern.test(rtlWrapped('A.B+C@Example.com'))).toBe(true)
    expect(pattern.test('axb+c@example.com')).toBe(false)
    expect(pattern.test('za.b+c@example.com')).toBe(false)
  })

  it('שומרת רישיות ומחזירה מחרוזת ריקה לקלט שאינו מחרוזת', () => {
    expect(normalizeEmailInput('  User@Example.com ')).toBe('User@Example.com')
    expect(normalizeEmailInput(undefined)).toBe('')
    expect(normalizeEmailInput(42)).toBe('')
  })
})
