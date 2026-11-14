import { describe, it, expect } from 'vitest'
import {
  buildPluginBreadcrumbs,
  hasDistinctDescription,
  heroDescription,
  versionHref,
  formatCount,
  displayUpdatedDate,
  ownerPermissions,
  serviceOwnerActions,
  splitUserText
} from './pluginDetailModel'

describe('buildPluginBreadcrumbs', () => {
  it('store › first category › name', () => {
    expect(buildPluginBreadcrumbs({ name: 'מרקר', categories: [{ slug: 'tools', name: 'כלים' }, { slug: 'x', name: 'אחר' }] })).toEqual([
      { label: 'חנות התוספים', href: '/plugins' },
      { label: 'כלים', href: '/plugins/category/tools' },
      { label: 'מרקר' }
    ])
  })
  it('skips the category when there is none', () => {
    expect(buildPluginBreadcrumbs({ name: 'מרקר' })).toHaveLength(2)
  })
})

describe('hasDistinctDescription', () => {
  it('false when the full description repeats the short one', () => {
    expect(hasDistinctDescription({ shortDescription: 'תוסף  לסימון', description: 'תוסף לסימון' })).toBe(false)
    expect(hasDistinctDescription({ shortDescription: 'תוסף לסימון טקסט בספר', description: 'תוסף לסימון' })).toBe(false)
  })
  it('true when the full description adds content', () => {
    expect(hasDistinctDescription({ shortDescription: 'קצר', description: 'קצר\n\nועוד פרטים' })).toBe(true)
  })
  it('false when empty', () => {
    expect(hasDistinctDescription({ shortDescription: 'קצר', description: '  ' })).toBe(false)
  })
})

describe('heroDescription', () => {
  it('prefers the short description, falls back to the full one', () => {
    expect(heroDescription({ shortDescription: 'קצר', description: 'ארוך' })).toBe('קצר')
    expect(heroDescription({ shortDescription: '', description: 'ארוך' })).toBe('ארוך')
  })
})

describe('versionHref', () => {
  it('latest → plain id; archived → id@version', () => {
    expect(versionHref('abc', { version: '1.2.0', isLatest: true })).toBe('/plugins/abc')
    expect(versionHref('abc', { version: '1.1.0', isLatest: false })).toBe('/plugins/abc@1.1.0')
  })
})

describe('formatCount / displayUpdatedDate', () => {
  it('formats with thousands separator', () => {
    expect(formatCount(2473)).toBe((2473).toLocaleString('he-IL'))
    expect(formatCount(undefined)).toBe('0')
  })
  it('prefers the file date', () => {
    expect(displayUpdatedDate({ fileUpdatedAt: '2026-01-02', originalDate: '2025-01-01', updatedAt: '2024-01-01' })).toBe('2026-01-02')
    expect(displayUpdatedDate({ updatedAt: '2024-01-01' })).toBe('2024-01-01')
  })
})

describe('ownerPermissions', () => {
  const base = { authorId: 'u1', isHistoricalVersion: false, isSuspended: false, suspendedByRole: null }
  it('the uploader can edit and suspend the live version', () => {
    expect(ownerPermissions(base, 'u1')).toEqual({ canEdit: true, suspendedByAdmin: false, showSuspendToggle: true })
  })
  it('nobody else, and not on a historical version', () => {
    expect(ownerPermissions(base, 'u2').canEdit).toBe(false)
    expect(ownerPermissions(base, undefined).canEdit).toBe(false)
    expect(ownerPermissions({ ...base, isHistoricalVersion: true }, 'u1').canEdit).toBe(false)
  })
  it('an admin suspension cannot be undone by the uploader', () => {
    const p = ownerPermissions({ ...base, isSuspended: true, suspendedByRole: 'admin' }, 'u1')
    expect(p.suspendedByAdmin).toBe(true)
    expect(p.showSuspendToggle).toBe(false)
    expect(ownerPermissions({ ...base, isSuspended: true, suspendedByRole: 'owner' }, 'u1').showSuspendToggle).toBe(true)
  })
})

describe('splitUserText', () => {
  it('מנרמל \r\n ו-\r ומפצל לשורות', () => {
    expect(splitUserText("Jastrow English Aramaic dictionary\r\nמילון ג'סטרוב\rשורה שלישית")).toEqual([
      ['Jastrow English Aramaic dictionary', "מילון ג'סטרוב", 'שורה שלישית']
    ])
  })
  it('שורה ריקה מפרידה פסקאות; שורות ריקות בקצוות נזרקות', () => {
    expect(splitUserText('\r\n\r\nא\r\nב\r\n\r\n\r\nג\n  \n')).toEqual([['א', 'ב'], ['ג']])
  })
  it('ריק → אין פסקאות', () => {
    expect(splitUserText('')).toEqual([])
    expect(splitUserText(undefined)).toEqual([])
  })
})

describe('serviceOwnerActions', () => {
  it('תוסף שירות: במקום "ערוך" — קישור להגשות השירות, רק למעלה', () => {
    expect(serviceOwnerActions({ id: 'p1', hasService: true }, true)).toEqual({ showEdit: false, serviceUrl: '/plugins/p1/service' })
    expect(serviceOwnerActions({ id: 'p1', hasService: true }, false)).toEqual({ showEdit: false, serviceUrl: null })
  })
  it('תוסף רגיל — כמו קודם', () => {
    expect(serviceOwnerActions({ id: 'p1' }, true)).toEqual({ showEdit: true, serviceUrl: null })
    expect(serviceOwnerActions({ id: 'p1', hasService: false }, false)).toEqual({ showEdit: false, serviceUrl: null })
  })
})
