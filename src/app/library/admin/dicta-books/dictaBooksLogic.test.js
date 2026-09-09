import { describe, it, expect } from 'vitest'
import {
  getDateTimestamp,
  computeStatusCounts,
  filterBooksByStatus,
  sortBooks,
  getSortIcon,
} from './dictaBooksLogic'

describe('getDateTimestamp', () => {
  it('מחזיר null לערך חסר', () => {
    expect(getDateTimestamp(null)).toBeNull()
    expect(getDateTimestamp(undefined)).toBeNull()
    expect(getDateTimestamp('')).toBeNull()
  })

  it('מחזיר null לתאריך לא תקין', () => {
    expect(getDateTimestamp('not-a-date')).toBeNull()
  })

  it('מחזיר חותמת זמן מספרית לתאריך תקין', () => {
    expect(getDateTimestamp('2025-03-15')).toBe(new Date('2025-03-15').getTime())
  })
})

describe('computeStatusCounts', () => {
  it('סופר סה"כ ולפי סטטוס', () => {
    const books = [
      { status: 'available' },
      { status: 'in-progress' },
      { status: 'in-progress' },
      { status: 'completed' },
      { status: 'unknown-status' },
    ]
    expect(computeStatusCounts(books)).toEqual({
      total: 5,
      available: 1,
      inProgress: 2,
      completed: 1,
    })
  })

  it('מחזיר אפסים לרשימה ריקה', () => {
    expect(computeStatusCounts([])).toEqual({ total: 0, available: 0, inProgress: 0, completed: 0 })
  })
})

describe('filterBooksByStatus', () => {
  const books = [
    { _id: '1', status: 'available' },
    { _id: '2', status: 'in-progress' },
    { _id: '3', status: 'completed' },
  ]

  it("'all' מחזיר את כל הרשימה", () => {
    expect(filterBooksByStatus(books, 'all')).toHaveLength(3)
  })

  it('מסנן לפי סטטוס נבחר', () => {
    expect(filterBooksByStatus(books, 'in-progress').map((b) => b._id)).toEqual(['2'])
  })
})

describe('sortBooks', () => {
  it('ללא מפתח מיון - מחזיר עותק באותו סדר', () => {
    const books = [{ title: 'ב' }, { title: 'א' }]
    expect(sortBooks(books, { key: null, direction: 'asc' })).toEqual(books)
  })

  it('ממיין לפי title בסדר עולה/יורד', () => {
    const books = [{ title: 'ג' }, { title: 'א' }, { title: 'ב' }]
    expect(sortBooks(books, { key: 'title', direction: 'asc' }).map((b) => b.title)).toEqual([
      'א',
      'ב',
      'ג',
    ])
    expect(sortBooks(books, { key: 'title', direction: 'desc' }).map((b) => b.title)).toEqual([
      'ג',
      'ב',
      'א',
    ])
  })

  it('ממיין לפי claimedBy.name', () => {
    const books = [
      { claimedBy: { name: 'ב' } },
      { claimedBy: null },
      { claimedBy: { name: 'א' } },
    ]
    const sorted = sortBooks(books, { key: 'claimedBy', direction: 'asc' })
    expect(sorted.map((b) => b.claimedBy?.name || '')).toEqual(['', 'א', 'ב'])
  })

  it('ממיין לפי updatedAt כתאריך (מספרית) ולא לקסיקוגרפית', () => {
    // תאריכים בפורמט M/D/YYYY: השוואה לקסיקוגרפית הייתה ממיינת "9/1/2025"
    // לפני "12/1/2024" (התו '1' < '9'), בעוד שכרונולוגית הסדר הפוך
    const books = [
      { updatedAt: '9/1/2025' },
      { updatedAt: '12/1/2024' },
      { updatedAt: '1/1/2026' },
    ]
    const sorted = sortBooks(books, { key: 'updatedAt', direction: 'asc' })
    expect(sorted.map((b) => b.updatedAt)).toEqual(['12/1/2024', '9/1/2025', '1/1/2026'])
  })

  it('לא משנה את המערך המקורי (immutable)', () => {
    const books = [{ title: 'ב' }, { title: 'א' }]
    const original = [...books]
    sortBooks(books, { key: 'title', direction: 'asc' })
    expect(books).toEqual(original)
  })
})

describe('getSortIcon', () => {
  it('מחזיר חץ דו-כיווני כשהעמודה אינה עמודת המיון הנוכחית', () => {
    expect(getSortIcon({ key: 'title', direction: 'asc' }, 'status')).toBe('↕')
  })

  it('מחזיר חץ למעלה למיון עולה ולמטה ליורד', () => {
    expect(getSortIcon({ key: 'title', direction: 'asc' }, 'title')).toBe('↑')
    expect(getSortIcon({ key: 'title', direction: 'desc' }, 'title')).toBe('↓')
  })
})
