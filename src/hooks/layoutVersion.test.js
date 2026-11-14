import { describe, expect, test } from 'vitest'
import { versionFor, nextVersionRecord } from './layoutVersion'

describe('layoutVersion', () => {
  test('versionFor מחזיר את הגרסה רק לעמוד שאליו היא שייכת', () => {
    const rec = { pageId: 'p2', version: 5 }
    expect(versionFor(rec, 'p2')).toBe(5)
    expect(versionFor(rec, 'p1')).toBe(0)
    expect(versionFor(null, 'p1')).toBe(0)
  })

  test('nextVersionRecord מעדכן את העמוד הנוכחי', () => {
    expect(nextVersionRecord({ pageId: 'p1', version: 1 }, 'p1', 2)).toEqual({ pageId: 'p1', version: 2 })
    // השרת לא החזיר גרסה — נשארים עם הקודמת
    expect(nextVersionRecord({ pageId: 'p1', version: 1 }, 'p1', undefined)).toEqual({ pageId: 'p1', version: 1 })
  })

  test('רגרסיה: תשובה של עמוד קודם לא דורסת את גרסת העמוד החדש', () => {
    const rec = { pageId: 'p2', version: 7 }
    expect(nextVersionRecord(rec, 'p1', 3)).toBe(rec)
  })
})
