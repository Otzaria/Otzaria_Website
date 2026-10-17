import { describe, expect, it } from 'vitest'
import { formatReleaseDate, formatSize, otherPlatform, resolveShownPlatform } from './offlinePlatforms.js'

// זיהוי המערכת עצמו — src/lib/detectOs.test.mjs

describe('resolveShownPlatform', () => {
  it('מערכת שזוהתה — הכרטיס שלה מוצג, ומסומן כמחשב של המבקר', () => {
    expect(resolveShownPlatform('windows')).toEqual({ key: 'windows', matched: true })
    expect(resolveShownPlatform('macos')).toEqual({ key: 'macos', matched: true })
  })
  it('טלפון, Linux או לא ידוע — Windows, בלי סימון "המחשב שלך"', () => {
    for (const os of ['mobile', 'other', null, undefined]) {
      expect(resolveShownPlatform(os)).toEqual({ key: 'windows', matched: false })
    }
  })
})

describe('otherPlatform', () => {
  it('המערכת השנייה, לקישור המשני', () => {
    expect(otherPlatform('windows')).toBe('macos')
    expect(otherPlatform('macos')).toBe('windows')
  })
})

describe('formatSize', () => {
  it('מגה-בייט עם ספרה אחת, ובלי ספרה מ-100MB', () => {
    expect(formatSize(19_640_320)).toBe('18.7 MB')
    expect(formatSize(150 * 1024 * 1024)).toBe('150 MB')
  })
  it('בלי גודל — null', () => {
    expect(formatSize(0)).toBe(null)
    expect(formatSize(undefined)).toBe(null)
  })
})

describe('formatReleaseDate', () => {
  it('לפי שעון ירושלים (23:07 UTC הוא כבר היום הבא)', () => {
    const text = formatReleaseDate('2026-10-11T23:07:00Z')
    expect(text).toMatch(/12/)
    expect(text).toMatch(/2026/)
  })
  it('ערך חסר או שגוי — null', () => {
    expect(formatReleaseDate(null)).toBe(null)
    expect(formatReleaseDate('not-a-date')).toBe(null)
  })
})
