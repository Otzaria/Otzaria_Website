import { describe, it, expect } from 'vitest'
import { formatOutreachDate, filterOutreachItems, computeOutreachStats } from './outreachFilters'

const outreach = (overrides = {}) => ({
  _id: '1',
  instituteName: 'מכון א',
  contactName: 'ישראל ישראלי',
  contactPhone: '',
  contactEmail: '',
  outreachBy: '',
  subject: '',
  status: 'planned',
  ...overrides,
})

describe('formatOutreachDate', () => {
  it('מחזיר מקף לערך חסר', () => {
    expect(formatOutreachDate(null)).toBe('—')
    expect(formatOutreachDate(undefined)).toBe('—')
    expect(formatOutreachDate('')).toBe('—')
  })

  it('מחזיר מקף לתאריך לא תקין', () => {
    expect(formatOutreachDate('not-a-date')).toBe('—')
  })

  it('מעצב תאריך תקין', () => {
    expect(formatOutreachDate('2025-03-15')).toMatch(/2025/)
  })
})

describe('filterOutreachItems', () => {
  const emptyDuplicates = new Map()

  it('ללא קריטריון מחזיר את כל הרשימה', () => {
    const items = [outreach(), outreach({ _id: '2' })]
    expect(filterOutreachItems(items, { duplicatesById: emptyDuplicates })).toHaveLength(2)
  })

  it('מסנן לפי סטטוס', () => {
    const items = [outreach({ status: 'agreed' }), outreach({ _id: '2', status: 'refused' })]
    const result = filterOutreachItems(items, {
      statusFilter: 'agreed',
      duplicatesById: emptyDuplicates,
    })
    expect(result.map((i) => i._id)).toEqual(['1'])
  })

  it('onlyDuplicates: משאיר רק פריטים שמופיעים ב-duplicatesById', () => {
    const items = [outreach({ _id: '1' }), outreach({ _id: '2' })]
    const duplicatesById = new Map([['1', [{}]]])
    const result = filterOutreachItems(items, { onlyDuplicates: true, duplicatesById })
    expect(result.map((i) => i._id)).toEqual(['1'])
  })

  it('חיפוש טקסט: תואם על פני כמה שדות', () => {
    const items = [
      outreach({ instituteName: 'מכון מיוחד', contactName: 'א' }),
      outreach({ _id: '2', instituteName: 'אחר', contactPhone: '0501234567' }),
    ]
    expect(
      filterOutreachItems(items, { search: 'מיוחד', duplicatesById: emptyDuplicates })
    ).toHaveLength(1)
    expect(
      filterOutreachItems(items, { search: '0501234567', duplicatesById: emptyDuplicates })
    ).toHaveLength(1)
    expect(
      filterOutreachItems(items, { search: 'לא קיים', duplicatesById: emptyDuplicates })
    ).toHaveLength(0)
  })
})

describe('computeOutreachStats', () => {
  it('סופר סה"כ, פתוחות, כפילויות ולפי סטטוס', () => {
    const items = [
      outreach({ _id: '1', status: 'planned' }),
      outreach({ _id: '2', status: 'agreed' }),
      outreach({ _id: '3', status: 'contacted' }),
    ]
    const duplicatesById = new Map([['1', [{}]]])
    expect(computeOutreachStats(items, duplicatesById)).toEqual({
      total: 3,
      open: 2, // planned + contacted הם "פתוחים"; agreed אינו
      duplicates: 1,
      byStatus: { planned: 1, agreed: 1, contacted: 1 },
    })
  })
})
