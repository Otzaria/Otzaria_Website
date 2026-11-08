import { describe, expect, test } from 'vitest'
import { edgeIndex, filterOptions, moveIndex, selectedValues, summaryText, toggleValue, typeaheadIndex } from './selectMenuModel'
import { placeMenu } from './selectMenuGeometry'

const OPTS = [
  { value: 'a', label: 'אבן שהם' },
  { value: 'b', label: 'אור החיים', disabled: true },
  { value: 'c', label: 'אמת ליעקב' },
  { value: 'd', label: 'בית יוסף' },
]

describe('selectMenuModel', () => {
  test('selectedValues', () => {
    expect(selectedValues('a', false)).toEqual(['a'])
    expect(selectedValues('', false)).toEqual([])
    expect(selectedValues(null, false)).toEqual([])
    expect(selectedValues(['a', 'c'], true)).toEqual(['a', 'c'])
    expect(selectedValues('a', true)).toEqual([])
  })

  test('filterOptions: כל המילים, בלי תלות בניקוד, ובדואר שברמז', () => {
    expect(filterOptions(OPTS, '').length).toBe(4)
    expect(filterOptions(OPTS, 'יוסף בית').map((o) => o.value)).toEqual(['d'])
    expect(filterOptions(OPTS, 'אֱמֶת').map((o) => o.value)).toEqual(['c'])
    expect(filterOptions([{ value: 'x', label: 'משה', hint: 'Moshe@Mail.com' }], 'moshe@').map((o) => o.value)).toEqual(['x'])
  })

  test('summaryText', () => {
    expect(summaryText(OPTS, [], 'הכול')).toBe('הכול')
    expect(summaryText(OPTS, ['c'], 'הכול')).toBe('אמת ליעקב')
    expect(summaryText(OPTS, ['a', 'c', 'd'], 'הכול')).toBe('אבן שהם ועוד 2')
    expect(summaryText(OPTS, ['zzz'], 'הכול')).toBe('zzz')
  })

  test('moveIndex מדלג על מושבתות ולא גולש', () => {
    expect(moveIndex(OPTS, 0, 1)).toBe(2)
    expect(moveIndex(OPTS, 2, -1)).toBe(0)
    expect(moveIndex(OPTS, 3, 1)).toBe(3)
    expect(moveIndex(OPTS, 0, 10)).toBe(3)
    expect(moveIndex(OPTS, -1, 1)).toBe(0)
    expect(edgeIndex(OPTS, false)).toBe(0)
    expect(edgeIndex(OPTS, true)).toBe(3)
    expect(edgeIndex([{ value: 'x', label: 'x', disabled: true }], false)).toBe(-1)
  })

  test('typeaheadIndex: תחילית, ומחזור באותה אות', () => {
    expect(typeaheadIndex(OPTS, 'ב', -1)).toBe(3)
    expect(typeaheadIndex(OPTS, 'א', 0)).toBe(2) // מדלג על המושבתת
    expect(typeaheadIndex(OPTS, 'אא', 2)).toBe(0)
    expect(typeaheadIndex(OPTS, 'אמ', 0)).toBe(2)
    expect(typeaheadIndex(OPTS, 'ת', 0)).toBe(-1)
  })

  test('toggleValue שומר על סדר האפשרויות', () => {
    expect(toggleValue(OPTS, ['d'], 'a')).toEqual(['a', 'd'])
    expect(toggleValue(OPTS, ['a', 'd'], 'a')).toEqual(['d'])
  })
})

describe('placeMenu', () => {
  const viewport = { width: 1280, height: 800 }
  const trigger = { top: 100, bottom: 148, left: 900, right: 1200, width: 300 }

  test('מתחת לכפתור, מיושר לקצה הימני ב-RTL, ברוחב הכפתור לפחות', () => {
    expect(placeMenu({ trigger, menu: { width: 200, height: 300 }, viewport, rtl: true }))
      .toEqual({ left: 900, top: 152, width: 300, maxHeight: 640, placement: 'below' })
  })

  test('למעלה כשלמטה אין מקום; בתוך המסך גם בטלפון', () => {
    const low = { top: 700, bottom: 748, left: 20, right: 120, width: 100 }
    const out = placeMenu({ trigger: low, menu: { width: 260, height: 400 }, viewport: { width: 390, height: 800 }, rtl: true, minWidth: 224 })
    expect(out.placement).toBe('above')
    expect(out.left).toBe(8)
    expect(out.top).toBe(700 - 4 - 400)
    expect(out.maxHeight).toBe(688)
  })

  test('תקרת גובה ורוחב', () => {
    const out = placeMenu({ trigger, menu: { width: 900, height: 2000 }, viewport, maxWidth: 384, maxHeight: 416 })
    expect(out.width).toBe(384)
    expect(out.maxHeight).toBe(416)
  })
})
