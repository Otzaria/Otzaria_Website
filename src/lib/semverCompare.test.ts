import { describe, it, expect } from 'vitest'
import { compareVersions } from './semverCompare'

// compareVersions משמש גם בבדיקה המקדימה בלקוח (דף העלאת תוסף, מול
// MIN_SUPPORTED_APP_VERSION) וגם בשרת (upload/route.js ועוד) — הבדיקות כאן
// מכסות את המקרים שמשמעותיים לשני הצדדים.
describe('compareVersions', () => {
  it('treats equal multi-part versions as equal', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('compares multi-part versions numerically, not lexicographically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1)
  })

  it('treats a missing trailing part as 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.1', '1.2')).toBe(1)
    expect(compareVersions('0.9.89', '0.9.89')).toBe(0)
  })

  it('is used as a >= check in the upload pre-check (compareVersions(min, required) < 0 means too low)', () => {
    // גרסת מינימום שווה לנדרש — עוברת (לא פחות מ-)
    expect(compareVersions('0.9.89', '0.9.89') < 0).toBe(false)
    // גרסת מינימום נמוכה מהנדרש — נחסמת
    expect(compareVersions('0.9.88', '0.9.89') < 0).toBe(true)
    // גרסת מינימום גבוהה מהנדרש — עוברת
    expect(compareVersions('1.0.0', '0.9.89') < 0).toBe(false)
  })

  it('ranks a release above its own prerelease', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1)
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1)
  })

  it('compares prerelease identifiers numerically when both are numeric', () => {
    expect(compareVersions('1.0.0-2', '1.0.0-10')).toBe(-1)
  })
})
