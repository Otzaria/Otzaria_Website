import { describe, it, expect, vi, afterEach } from 'vitest'
import { toGematria, formatHebrewDate, formatTimeAgo } from './pageCardDates'

// המימוש הקודם (פורמטר חדש בכל קריאה) — ההתנהגות חייבת להישאר זהה
function legacyFormatHebrewDate(dateString) {
  if (!dateString) return ''
  const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).formatToParts(new Date(dateString))
  const day = parseInt(parts.find(p => p.type === 'day').value, 10)
  const month = parts.find(p => p.type === 'month').value
  const year = parseInt(parts.find(p => p.type === 'year').value, 10)
  return `${toGematria(day)} ב${month} ${toGematria(year % 1000)}`
}

describe('toGematria', () => {
  it('handles 15/16 and adds geresh/gershayim', () => {
    expect(toGematria(15)).toBe('ט"ו')
    expect(toGematria(16)).toBe('ט"ז')
    expect(toGematria(1)).toBe("א'")
    expect(toGematria(786)).toBe('תשפ"ו')
  })
})

describe('formatHebrewDate', () => {
  it('returns empty string for missing / invalid input', () => {
    expect(formatHebrewDate(null)).toBe('')
    expect(formatHebrewDate('')).toBe('')
    expect(formatHebrewDate('not a date')).toBe('')
  })

  it('matches the previous per-call formatter across a range of dates', () => {
    const start = Date.UTC(2025, 0, 1)
    for (let i = 0; i < 400; i += 7) {
      const iso = new Date(start + i * 86400000).toISOString()
      expect(formatHebrewDate(iso)).toBe(legacyFormatHebrewDate(iso))
    }
  })
})

describe('formatTimeAgo', () => {
  afterEach(() => vi.useRealTimers())

  it('formats today / yesterday / N days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-28T12:00:00Z'))
    expect(formatTimeAgo('2026-09-28T08:00:00Z')).toBe('היום')
    expect(formatTimeAgo('2026-09-27T08:00:00Z')).toBe('אתמול')
    expect(formatTimeAgo('2026-09-20T12:00:00Z')).toBe('לפני 8 ימים')
    expect(formatTimeAgo(null)).toBe('')
  })
})
