import { describe, expect, test, vi } from 'vitest'
import { combinedFilename, groupMenuItems, itemMenuItems, primaryAction, toName } from './uploadRowActions'

const up = (id, extra = {}) => ({ id, bookName: `ספר - עמוד ${id}`, uploadedBy: 'משה', uploadedByEmail: 'm@x', ...extra })
const group = (files, extra = {}) => ({ key: 'ספר', title: 'ספר', base: 'ספר', uploads: files, visible: files, ...extra })
const actions = () => ({
  restore: vi.fn(), download: vi.fn(), downloadCombined: vi.fn(), trash: vi.fn(), deleteForever: vi.fn(),
  openEditCopy: vi.fn(), createEditCopy: vi.fn(), message: vi.fn(), isDownloading: () => false,
})
const admin = { batchDownload: true, message: true }
const books = { batchDownload: false, message: false }
const labels = (items) => items.map((i) => (i.separator ? '—' : i.label))

describe('primaryAction', () => {
  test('קובץ אחד — "הורד קובץ"; כמה — "הורד N קבצים" למנהל כללי בלבד', () => {
    const a = actions()
    expect(primaryAction({ group: group([up('1')]), variant: 'uploads', permissions: books, actions: a }).label).toBe('הורד קובץ')
    const many = group([up('1'), up('2')])
    const p = primaryAction({ group: many, variant: 'uploads', permissions: admin, actions: a })
    expect(p.label).toBe('הורד 2 קבצים')
    p.onClick()
    expect(a.downloadCombined).toHaveBeenCalledWith(many.visible, many)
    // מנהל ספרים — בלי הורדה מאוחדת: הפעולה הראשית פותחת את הספר (ושם "הורד" לכל קובץ)
    const onExpand = vi.fn()
    const open = primaryAction({ group: many, variant: 'uploads', permissions: books, actions: a, onExpand })
    expect(open.label).toBe('הצג 2 קבצים')
    open.onClick()
    expect(onExpand).toHaveBeenCalled()
  })

  test('באשפה — "שחזר" / "שחזר N קבצים"', () => {
    const a = actions()
    expect(primaryAction({ group: group([up('1')]), variant: 'trash', permissions: books, actions: a }).label).toBe('שחזר')
    expect(primaryAction({ group: group([up('1'), up('2'), up('3')]), variant: 'trash', permissions: books, actions: a }).label).toBe('שחזר 3 קבצים')
  })
})

describe('groupMenuItems', () => {
  test('מנהל כללי: עותק, הודעה, מפריד, ובסוף מחק (אדום)', () => {
    const items = groupMenuItems({ group: group([up('1'), up('2')]), variant: 'uploads', permissions: admin, actions: actions() })
    expect(labels(items)).toEqual(['צור עותק עריכה', 'שלח הודעה למשה', '—', 'מחק 2 קבצים'])
    expect(items.at(-1).danger).toBe(true)
  })

  test('מנהל ספרים: בלי "שלח הודעה"; עותק קיים — "ערוך עותק"', () => {
    const a = actions()
    const items = groupMenuItems({ group: group([up('1', { editCopy: 'c1' })]), variant: 'uploads', permissions: books, actions: a })
    expect(labels(items)).toEqual(['ערוך עותק', '—', 'מחק'])
    items[0].onSelect()
    expect(a.openEditCopy).toHaveBeenCalledWith('c1')
  })

  test('אורח בלי אימייל — אין למי לשלוח הודעה', () => {
    const items = groupMenuItems({ group: group([up('1', { uploadedBy: undefined, uploadedByEmail: undefined })]), variant: 'uploads', permissions: admin, actions: actions() })
    expect(labels(items)).toEqual(['צור עותק עריכה', '—', 'מחק'])
  })

  test('אשפה: רק "מחק לצמיתות"', () => {
    const items = groupMenuItems({ group: group([up('1'), up('2')]), variant: 'trash', permissions: admin, actions: actions() })
    expect(labels(items)).toEqual(['מחק לצמיתות 2 קבצים'])
    expect(items[0].danger).toBe(true)
  })
})

describe('itemMenuItems', () => {
  test('קובץ: הודעה (למנהל כללי), מפריד, מחק; באשפה — מחק לצמיתות', () => {
    const a = actions()
    const file = up('7')
    expect(labels(itemMenuItems({ upload: file, group: group([file]), variant: 'uploads', permissions: admin, actions: a }))).toEqual(['שלח הודעה למשה', '—', 'מחק'])
    expect(labels(itemMenuItems({ upload: file, group: group([file]), variant: 'uploads', permissions: books, actions: a }))).toEqual(['מחק'])
    const [forever] = itemMenuItems({ upload: file, group: group([file]), variant: 'trash', permissions: books, actions: a })
    forever.onSelect()
    expect(a.deleteForever).toHaveBeenCalledWith([file], expect.objectContaining({ key: 'ספר' }))
  })
})

test('toName ו-combinedFilename', () => {
  expect(toName('משה')).toBe('למשה')
  expect(toName('John')).toBe('ל-John')
  expect(toName('')).toBe('לאורח')
  expect(combinedFilename('תלמוד: בבלי/שבת')).toBe('תלמוד  בבלי שבת.txt')
})
