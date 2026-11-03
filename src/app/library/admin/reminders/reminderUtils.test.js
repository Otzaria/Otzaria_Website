import { describe, it, expect } from 'vitest'
import {
  normalizeId,
  formatTimeAgo,
  computeRegularRecipients,
  generateEmailHtml,
} from './reminderUtils'

describe('normalizeId', () => {
  it('מחזיר null לערך חסר', () => {
    expect(normalizeId(null)).toBeNull()
    expect(normalizeId(undefined)).toBeNull()
    expect(normalizeId('')).toBeNull()
  })

  it('ממיר ל-string', () => {
    expect(normalizeId(123)).toBe('123')
    expect(normalizeId('abc')).toBe('abc')
  })
})

describe('formatTimeAgo', () => {
  it('"ממש עכשיו" לפחות מדקה', () => {
    expect(formatTimeAgo(new Date().toISOString())).toBe('ממש עכשיו')
  })

  it('דקות', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000)
    expect(formatTimeAgo(d.toISOString())).toBe('לפני 5 דקות')
  })

  it('שעה יחידה בלשון יחיד', () => {
    const d = new Date(Date.now() - 60 * 60 * 1000)
    expect(formatTimeAgo(d.toISOString())).toBe('לפני שעה')
  })

  it('כמה שעות', () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
    expect(formatTimeAgo(d.toISOString())).toBe('לפני 3 שעות')
  })

  it('יום אחד בלשון יחיד', () => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(formatTimeAgo(d.toISOString())).toBe('לפני יום אחד')
  })

  it('כמה ימים', () => {
    const d = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    expect(formatTimeAgo(d.toISOString())).toBe('לפני 5 ימים')
  })
})

describe('computeRegularRecipients', () => {
  const allUsers = [
    { _id: 'u1', email: 'a@example.com', name: 'אלכס', acceptReminders: true, isVerified: true },
    { _id: 'u2', email: 'b@example.com', name: 'בני', acceptReminders: false, isVerified: true },
    { _id: 'u3', email: 'c@example.com', name: 'גדי', acceptReminders: true, isVerified: false },
    { id: 'u4', email: 'd@example.com', name: 'דנה', acceptReminders: true, isVerified: true },
  ]

  it('כולל רק עמודים in-progress עם משתמש תקין (מאשר תזכורות ומאומת)', () => {
    const pages = [
      { status: 'in-progress', claimedById: 'u1' },
      { status: 'in-progress', claimedById: 'u2' }, // לא מאשר תזכורות
      { status: 'in-progress', claimedById: 'u3' }, // לא מאומת
      { status: 'completed', claimedById: 'u1' }, // לא in-progress
    ]
    const result = computeRegularRecipients(pages, allUsers)
    expect(result).toEqual([{ email: 'a@example.com', name: 'אלכס', id: 'u1' }])
  })

  it('תומך גם ב-holder וגם ב-claimedById שהוא אובייקט עם _id', () => {
    const pages = [
      { status: 'in-progress', holder: 'u4' },
      { status: 'in-progress', claimedById: { _id: 'u1' } },
    ]
    const result = computeRegularRecipients(pages, allUsers)
    expect(result.map((u) => u.email).sort()).toEqual(['a@example.com', 'd@example.com'])
  })

  it('מסנן כפילויות לפי אימייל', () => {
    const pages = [
      { status: 'in-progress', claimedById: 'u1' },
      { status: 'in-progress', claimedById: 'u1' },
    ]
    expect(computeRegularRecipients(pages, allUsers)).toHaveLength(1)
  })

  it('שם ברירת מחדל "משתמש ללא שם" כשאין name', () => {
    const users = [{ _id: 'u1', email: 'a@example.com', acceptReminders: true, isVerified: true }]
    const pages = [{ status: 'in-progress', claimedById: 'u1' }]
    expect(computeRegularRecipients(pages, users)[0].name).toBe('משתמש ללא שם')
  })
})

describe('generateEmailHtml', () => {
  it('בונה קישור לספר רגיל וכפתור "כנס לספרייה"', () => {
    const html = generateEmailHtml('שם ספר', 'שלום\nעולם')
    expect(html).toContain('/library/books/שם ספר')
    expect(html).toContain('כנס לספרייה')
    expect(html).toContain('שלום<br/>עולם')
    expect(html).toContain('הודעה בנוגע לספר: שם ספר')
  })
})
