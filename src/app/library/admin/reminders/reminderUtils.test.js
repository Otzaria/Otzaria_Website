import { describe, it, expect } from 'vitest'
import {
  normalizeId,
  formatTimeAgo,
  computeRegularRecipients,
  computeDictaRecipients,
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

describe('computeDictaRecipients', () => {
  const allUsers = [
    { _id: 'u1', email: 'a@example.com', name: 'אלכס', acceptReminders: true, isVerified: true },
    { _id: 'u2', email: 'b@example.com', name: 'בני', acceptReminders: true, isVerified: true },
  ]
  const now = new Date('2025-01-10T00:00:00Z')

  it('כולל רק ספרים in-progress שעברו את סף הימים', () => {
    const dictaBooks = [
      { title: 'ספר א', status: 'in-progress', claimedBy: 'u1', claimedAt: '2025-01-01T00:00:00Z' }, // 9 ימים
      { title: 'ספר ב', status: 'in-progress', claimedBy: 'u2', claimedAt: '2025-01-08T00:00:00Z' }, // 2 ימים
    ]
    const result = computeDictaRecipients(dictaBooks, allUsers, 5, now)
    expect(result).toHaveLength(1)
    expect(result[0].email).toBe('a@example.com')
    expect(result[0].books).toEqual([{ title: 'ספר א', daysSinceClaim: 9 }])
    expect(result[0].maxDays).toBe(9)
  })

  it('daysThreshold=0 כולל את כל הספרים בטיפול', () => {
    const dictaBooks = [
      { title: 'ספר א', status: 'in-progress', claimedBy: 'u1', claimedAt: '2025-01-09T00:00:00Z' },
    ]
    expect(computeDictaRecipients(dictaBooks, allUsers, 0, now)).toHaveLength(1)
  })

  it('כולל ספר שמגיע בדיוק לסף הימים (>=, לא >)', () => {
    const dictaBooks = [
      { title: 'ספר א', status: 'in-progress', claimedBy: 'u1', claimedAt: '2025-01-05T00:00:00Z' }, // בדיוק 5 ימים
    ]
    expect(computeDictaRecipients(dictaBooks, allUsers, 5, now)).toHaveLength(1)
  })

  it('מצרף כמה ספרים לאותו משתמש ומעדכן maxDays', () => {
    const dictaBooks = [
      { title: 'ספר א', status: 'in-progress', claimedBy: { _id: 'u1' }, claimedAt: '2025-01-01T00:00:00Z' },
      { title: 'ספר ב', status: 'in-progress', claimedBy: { _id: 'u1' }, claimedAt: '2025-01-05T00:00:00Z' },
    ]
    const result = computeDictaRecipients(dictaBooks, allUsers, 0, now)
    expect(result).toHaveLength(1)
    expect(result[0].books).toHaveLength(2)
    expect(result[0].maxDays).toBe(9)
  })

  it('מתעלם מספרים ללא claimedAt או שאינם in-progress', () => {
    const dictaBooks = [
      { title: 'ספר א', status: 'in-progress', claimedBy: 'u1' }, // אין claimedAt
      { title: 'ספר ב', status: 'completed', claimedBy: 'u1', claimedAt: '2025-01-01T00:00:00Z' },
    ]
    expect(computeDictaRecipients(dictaBooks, allUsers, 0, now)).toEqual([])
  })
})

describe('generateEmailHtml', () => {
  it('בונה קישור לספר רגיל וכפתור "כנס לספרייה"', () => {
    const html = generateEmailHtml('שם ספר', 'שלום\nעולם', false)
    expect(html).toContain('/library/books/שם ספר')
    expect(html).toContain('כנס לספרייה')
    expect(html).toContain('שלום<br/>עולם')
    expect(html).toContain('הודעה בנוגע לספר: שם ספר')
  })

  it('בונה קישור לספרי דיקטה וכפתור "כנס לספרי הדיקטה שלי"', () => {
    const html = generateEmailHtml('ספרי דיקטה', 'תוכן', true)
    expect(html).toContain('/library/dicta-books?status=my-books')
    expect(html).toContain('כנס לספרי הדיקטה שלי')
    expect(html).toContain('הודעה בנוגע לספר דיקטה: ספרי דיקטה')
  })
})
