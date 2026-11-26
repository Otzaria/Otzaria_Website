import { describe, it, expect } from 'vitest'
import { downloadLinks, reportSummary, placeOf } from './offlineLinks'

describe('קישורי ההורדה', () => {
  it('זיהוי: קובץ לכל חלק, עם נקודת-ההתחלה ו"בלי עמוד מלא"', () => {
    const plan = { offlineId: 'tpo-20261123-a1b2c3', per: 1000, count: 1500, parts: [{ after: null, through: 'abc', count: 1000 }, { after: 'abc', through: 'def', count: 500 }] }
    const l = downloadLinks('ocr', plan, { ctx: false })
    expect(l.map((x) => [x.label, x.count])).toEqual([['חלק 1 מתוך 2', 1000], ['חלק 2 מתוך 2', 500]])
    const q = new URL(l[1].href, 'http://x').searchParams
    expect(Object.fromEntries(q)).toEqual({ oid: 'tpo-20261123-a1b2c3', part: '2', parts: '2', n: '1000', after: 'abc', through: 'def', ctx: '0' })
    expect(new URL(l[0].href, 'http://x').searchParams.get('through')).toBe('abc')
    expect(l[0].href).toMatch(/^\/api\/admin\/training-proof\/offline\/download\/ocr\?/)
    expect(downloadLinks('ocr', { ...plan, parts: [plan.parts[0]] })[0].label).toBe('הקובץ')
  })
  it('גלאי: קובץ לכל ספר', () => {
    const l = downloadLinks('frames', { offlineId: 'tpo-20261123-a1b2c3', books: [{ book: 'b-1', alias: 'ספר 1', pages: 4 }] })
    expect(l[0]).toMatchObject({ label: 'ספר 1', count: 4 })
    expect(l[0].href).toContain('book=b-1')
    expect(downloadLinks('ocr', null)).toEqual([])
  })
})

describe('הדוח', () => {
  it('סיכום ודילוגים לפי סיבה', () => {
    const r = reportSummary({ approved: 3, fixed: 1, rejected: 0, total: 6, skipped: { gone: 1, resubmitted: 1 } }, { gone: 'נעלם', resubmitted: 'הוגש מחדש' })
    expect(r.head).toBe('אושרו 3 · תוקנו ואושרו 1 · דולגו 2 (מתוך 6 בקובץ)')
    expect(r.skips.map((s) => s.label)).toEqual(['נעלם', 'הוגש מחדש'])
    expect(reportSummary({ total: 1, skipped: { gone: 1 } }).head).toMatch(/^לא הוחלה אף החלטה/)
  })
  it('מקום פריט', () => {
    expect(placeOf({ alias: 'ספר 4', page: 3, line: 7 })).toBe("ספר 4 · עמ' 3 · שורה 7")
    expect(placeOf({ alias: 'ספר 4', page: null })).toBe('ספר 4')
  })
})
