import { describe, it, expect } from 'vitest'
import {
  NO_RECORD,
  NOT_ADAPTED_CATEGORY,
  matchesSourceItem,
  groupSourceItemsByCategory,
  computeSourceStats,
} from './sourcesFilters'

const book = (overrides = {}) => ({
  bookPath: 'ספרים/הלכה/דוגמה.txt',
  bookTitle: 'ספר דוגמה',
  category: 'הלכה',
  kind: 'book',
  record: null,
  ...overrides,
})

describe('matchesSourceItem', () => {
  it('מחזיר true כשאין קריטריון סינון פעיל', () => {
    expect(matchesSourceItem(book())).toBe(true)
  })

  it('onlyMissing: מסנן פריטים עם רשומה', () => {
    const withRecord = book({ record: { status: 'ok' } })
    const withoutRecord = book()
    expect(matchesSourceItem(withRecord, { onlyMissing: true })).toBe(false)
    expect(matchesSourceItem(withoutRecord, { onlyMissing: true })).toBe(true)
  })

  it(`statusFilter=${NO_RECORD}: תואם רק פריטים ללא רשומה`, () => {
    expect(matchesSourceItem(book(), { statusFilter: NO_RECORD })).toBe(true)
    expect(
      matchesSourceItem(book({ record: { status: 'ok' } }), { statusFilter: NO_RECORD })
    ).toBe(false)
  })

  it('statusFilter רגיל: תואם רק כשהסטטוס של הרשומה זהה', () => {
    const item = book({ record: { status: 'approved' } })
    expect(matchesSourceItem(item, { statusFilter: 'approved' })).toBe(true)
    expect(matchesSourceItem(item, { statusFilter: 'pending' })).toBe(false)
  })

  it('חיפוש טקסט: תואם לפי כותרת, נתיב, בעלים או משיג האישור', () => {
    const item = book({
      bookTitle: 'עולת שלמה',
      record: { ownerName: 'ר׳ פלוני', obtainedBy: 'אלמוני' },
    })
    expect(matchesSourceItem(item, { search: 'עולת' })).toBe(true)
    expect(matchesSourceItem(item, { search: 'פלוני' })).toBe(true)
    expect(matchesSourceItem(item, { search: 'אלמוני' })).toBe(true)
    expect(matchesSourceItem(item, { search: 'לא קיים' })).toBe(false)
  })

  it('חיפוש טקסט על סט: תואם גם כשחבר בסט תואם ולא הסט עצמו', () => {
    const set = book({
      kind: 'set',
      bookTitle: 'שם הסט',
      books: [book({ bookTitle: 'ספר מיוחד', bookPath: 'a/b.txt' })],
    })
    expect(matchesSourceItem(set, { search: 'מיוחד' })).toBe(true)
    expect(matchesSourceItem(set, { search: 'לא קיים' })).toBe(false)
  })
})

describe('groupSourceItemsByCategory', () => {
  it('מקבץ לפי קטגוריה וסופר את מספר הפריטים בכל קבוצה', () => {
    const items = [book({ category: 'הלכה' }), book({ category: 'הלכה', bookPath: 'x' }), book({ category: 'אגדה' })]
    const groups = groupSourceItemsByCategory(items)
    const byCategory = Object.fromEntries(groups.map((g) => [g.category, g.count]))
    expect(byCategory).toEqual({ הלכה: 2, אגדה: 1 })
  })

  it(`שם קטגוריה "${NOT_ADAPTED_CATEGORY}" תמיד אחרון, גם כשהוא ראשון אלפביתית`, () => {
    const items = [book({ category: NOT_ADAPTED_CATEGORY }), book({ category: 'אגדה' })]
    const groups = groupSourceItemsByCategory(items)
    expect(groups.map((g) => g.category)).toEqual(['אגדה', NOT_ADAPTED_CATEGORY])
  })

  it('ממיין קטגוריות רגילות לפי א-ב עברי', () => {
    const items = [book({ category: 'תנך' }), book({ category: 'אגדה' }), book({ category: 'הלכה' })]
    const groups = groupSourceItemsByCategory(items)
    expect(groups.map((g) => g.category)).toEqual(['אגדה', 'הלכה', 'תנך'])
  })
})

describe('computeSourceStats', () => {
  it('סופר סה"כ, סטים, עם/ללא רשומה, ולפי סטטוס', () => {
    const items = [
      book({ record: { status: 'approved' } }),
      book({ record: { status: 'approved' } }),
      book({ record: { status: 'pending' } }),
      book(),
      book({ kind: 'set', record: { status: 'approved' } }),
    ]
    const stats = computeSourceStats(items)
    expect(stats).toEqual({
      total: 5,
      sets: 1,
      withRecord: 4,
      missing: 1,
      byStatus: { approved: 3, pending: 1 },
    })
  })

  it('מחזיר אפסים על רשימה ריקה', () => {
    expect(computeSourceStats([])).toEqual({
      total: 0,
      sets: 0,
      withRecord: 0,
      missing: 0,
      byStatus: {},
    })
  })
})
