import { describe, it, expect } from 'vitest'
import { fitToolbarGroups } from './toolbarOverflow'

const groups = [
  { id: 'history', width: 90, priority: 2 },
  { id: 'format', width: 135, priority: 1 },
  { id: 'headings', width: 120, priority: 3 },
  { id: 'size', width: 90, priority: 5 },
  { id: 'tools', width: 90, priority: 4 },
  { id: 'insert', width: 90, priority: 5 }
]
// סך הכול: 615 + 6 מרווחים של 10 + "עוד" 44 = 719

describe('fitToolbarGroups', () => {
  it('הכול נכנס (כולל שם הפאנל) — אין תפריט', () => {
    expect(fitToolbarGroups({ groups, available: 800, gap: 10, moreWidth: 44, labelWidth: 50 }))
      .toEqual({ visible: groups.map((g) => g.id), overflow: [], showLabel: true })
  })

  it('אין מקום לשם הפאנל — הוא יורד ראשון, לפני כל קבוצה', () => {
    const r = fitToolbarGroups({ groups, available: 730, gap: 10, moreWidth: 44, labelWidth: 50 })
    expect(r.overflow).toEqual([])
    expect(r.showLabel).toBe(false)
  })

  it('יוצאות לפי עדיפות; בתיקו — המאוחרת בשורה קודם', () => {
    // 719 - 100 (insert) = 619
    expect(fitToolbarGroups({ groups, available: 650, gap: 10, moreWidth: 44 }).overflow).toEqual(['insert'])
    // אחר כך size (519), ואז tools (419)
    expect(fitToolbarGroups({ groups, available: 520, gap: 10, moreWidth: 44 }).overflow).toEqual(['size', 'insert'])
    expect(fitToolbarGroups({ groups, available: 420, gap: 10, moreWidth: 44 }).overflow).toEqual(['size', 'tools', 'insert'])
  })

  it('הסדר בשורה נשמר ב-visible', () => {
    expect(fitToolbarGroups({ groups, available: 420, gap: 10, moreWidth: 44 }).visible).toEqual(['history', 'format', 'headings'])
  })

  it('פאנל צר מאוד — נשארות רק הקבוצות המוצמדות', () => {
    const withPinned = [...groups, { id: 'ocr', width: 80, priority: 9, pinned: true }]
    const r = fitToolbarGroups({ groups: withPinned, available: 60, gap: 10, moreWidth: 44 })
    expect(r.visible).toEqual(['ocr'])
    expect(r.overflow).toHaveLength(6)
  })

  it('לפני מדידה (רוחב 0) — מציג הכול', () => {
    expect(fitToolbarGroups({ groups, available: 0 }).overflow).toEqual([])
    expect(fitToolbarGroups({ groups: undefined, available: 100 })).toEqual({ visible: [], overflow: [], showLabel: true })
  })
})
