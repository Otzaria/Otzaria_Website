import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeId,
  formatTimeAgo,
  computeRegularRecipients,
  generateEmailHtml,
} from './reminderUtils.js'

describe('normalizeId', () => {
  it('מחזיר null לערך חסר', () => {
    assert.equal(normalizeId(null), null)
    assert.equal(normalizeId(undefined), null)
    assert.equal(normalizeId(''), null)
  })

  it('ממיר ל-string', () => {
    assert.equal(normalizeId(123), '123')
    assert.equal(normalizeId('abc'), 'abc')
  })
})

describe('formatTimeAgo', () => {
  it('"ממש עכשיו" לפחות מדקה', () => {
    assert.equal(formatTimeAgo(new Date().toISOString()), 'ממש עכשיו')
  })

  it('דקות', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000)
    assert.equal(formatTimeAgo(d.toISOString()), 'לפני 5 דקות')
  })

  it('שעה יחידה בלשון יחיד', () => {
    const d = new Date(Date.now() - 60 * 60 * 1000)
    assert.equal(formatTimeAgo(d.toISOString()), 'לפני שעה')
  })

  it('כמה שעות', () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
    assert.equal(formatTimeAgo(d.toISOString()), 'לפני 3 שעות')
  })

  it('יום אחד בלשון יחיד', () => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
    assert.equal(formatTimeAgo(d.toISOString()), 'לפני יום אחד')
  })

  it('כמה ימים', () => {
    const d = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    assert.equal(formatTimeAgo(d.toISOString()), 'לפני 5 ימים')
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
    assert.deepEqual(result, [{ email: 'a@example.com', name: 'אלכס', id: 'u1' }])
  })

  it('תומך גם ב-holder וגם ב-claimedById שהוא אובייקט עם _id', () => {
    const pages = [
      { status: 'in-progress', holder: 'u4' },
      { status: 'in-progress', claimedById: { _id: 'u1' } },
    ]
    const result = computeRegularRecipients(pages, allUsers)
    assert.deepEqual(result.map((u) => u.email).sort(), ['a@example.com', 'd@example.com'])
  })

  it('מסנן כפילויות לפי אימייל', () => {
    const pages = [
      { status: 'in-progress', claimedById: 'u1' },
      { status: 'in-progress', claimedById: 'u1' },
    ]
    assert.equal(computeRegularRecipients(pages, allUsers).length, 1)
  })

  it('שם ברירת מחדל "משתמש ללא שם" כשאין name', () => {
    const users = [{ _id: 'u1', email: 'a@example.com', acceptReminders: true, isVerified: true }]
    const pages = [{ status: 'in-progress', claimedById: 'u1' }]
    assert.equal(computeRegularRecipients(pages, users)[0].name, 'משתמש ללא שם')
  })
})

describe('generateEmailHtml', () => {
  it('בונה קישור לספר רגיל וכפתור "כנס לספרייה"', () => {
    const html = generateEmailHtml('שם ספר', 'שלום\nעולם')
    assert.ok(html.includes('/library/books/שם ספר'))
    assert.ok(html.includes('כנס לספרייה'))
    assert.ok(html.includes('שלום<br/>עולם'))
    assert.ok(html.includes('הודעה בנוגע לספר: שם ספר'))
  })
})
