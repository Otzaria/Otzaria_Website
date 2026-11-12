import { describe, expect, it } from 'vitest'
import { STATUS_OPTIONS, activeFilters, clearedFilters, clearedKeepStatus, emptyView, filterBarState } from './filterState'

const defs = [
  { key: 'status', label: 'מצב', options: STATUS_OPTIONS, empty: 'submitted' },
  { key: 'track', label: 'כתב', options: [{ value: 'rashi', label: 'רש"י' }] },
  { key: 'vol', label: 'מתנדב', options: [{ value: 'v1', label: 'משה' }] },
]

describe('reviewFilters', () => {
  it('ברירת המחדל — אין סינון', () => {
    expect(filterBarState({ status: 'submitted', track: '', vol: '' }, defs)).toEqual({ count: 0, summary: [], active: false })
  })

  it('סופר רק בוררים שאינם בערך הריק, עם תווית הערך', () => {
    expect(activeFilters({ status: 'approved', track: 'rashi', vol: '' }, defs)).toEqual([
      { key: 'status', label: 'אושרו (עוד לא הורדו)' },
      { key: 'track', label: 'רש"י' },
    ])
    expect(filterBarState({ status: 'submitted', track: '', vol: 'v1' }, defs)).toEqual({ count: 1, summary: ['משה'], active: true })
  })

  it('ערך שאין לו אפשרות (מתנדב שעוד לא נטען) — מוצג כמו שהוא', () => {
    expect(activeFilters({ vol: 'v9' }, defs)).toEqual([{ key: 'vol', label: 'v9' }])
  })

  it('ניקוי מחזיר כל בורר לערך הריק ושומר שדות אחרים', () => {
    expect(clearedFilters({ status: 'approved', track: 'rashi', vol: 'v1', lowConf: true }, defs)).toEqual({ status: 'submitted', track: '', vol: '', lowConf: true })
  })
})

describe('emptyView / clearedKeepStatus', () => {
  const defs2 = [
    { key: 'status', label: 'מצב', options: [{ value: 'submitted', label: 'ממתינות' }, { value: 'approved', label: 'אושרו' }], empty: 'submitted' },
    { key: 'track', label: 'כתב', options: [{ value: 'rashi', label: 'רש"י' }] },
  ]
  it('בלי סינון — התור ריק: בשורה טובה, בלי "נקה סינון"', () => {
    expect(emptyView({ status: 'submitted', track: '' }, defs2)).toEqual({ title: 'הכול אושר — אין שורות שממתינות לאישור', canClear: false })
    expect(emptyView({ status: 'approved', track: '' }, defs2).canClear).toBe(false)
    expect(emptyView({ status: 'approved', track: '' }, defs2).title).toMatch(/אין שורות שאושרו/)
  })
  it('עם סינון — "אין שורות שמתאימות לסינון", והניקוי משאיר את המצב', () => {
    const f = { status: 'approved', track: 'rashi', lowConf: true }
    expect(emptyView(f, defs2)).toMatchObject({ title: 'אין שורות שמתאימות לסינון', canClear: true })
    expect(clearedKeepStatus(f, defs2)).toEqual({ status: 'approved', track: '', lowConf: true })
  })
})

