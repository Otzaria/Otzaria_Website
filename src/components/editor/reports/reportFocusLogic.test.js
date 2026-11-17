import { describe, it, expect } from 'vitest'
import { buildErrorMarker } from '@/lib/pageReports/rules'
import { barPlacement, locateInEditorFields, reportFocusNotice, reportIdFromSearch, reportMarkerLabel, reportMatchesPage } from './reportFocusLogic'

const ID = '0123456789abcdef01234567'
const report = { bookPath: 'ספר בדיקה', pageNumber: 3, column: 'content', original: 'שלמם', proposed: 'שלום', offset: 4, contextBefore: 'אמר ', contextAfter: ' עליכם' }

describe('reportIdFromSearch', () => {
  it('מזהה תקין בלבד', () => {
    expect(reportIdFromSearch(`?report=${ID}`)).toBe(ID)
    expect(reportIdFromSearch(`?x=1&report=${ID}`)).toBe(ID)
    expect(reportIdFromSearch('?report=abc')).toBeNull()
    expect(reportIdFromSearch('')).toBeNull()
    expect(reportIdFromSearch(undefined)).toBeNull()
  })
})

describe('reportMatchesPage', () => {
  it('לפי הספר (גם מקודד) והעמוד', () => {
    expect(reportMatchesPage(report, encodeURIComponent('ספר בדיקה'), '3')).toBe(true)
    expect(reportMatchesPage(report, 'ספר בדיקה', 3)).toBe(true)
    expect(reportMatchesPage(report, 'ספר בדיקה', 4)).toBe(false)
    expect(reportMatchesPage(report, 'אחר', 3)).toBe(false)
    expect(reportMatchesPage(null, 'ספר בדיקה', 3)).toBe(false)
  })
})

describe('locateInEditorFields', () => {
  it('שדה בלי data-column הוא content; שני טורים לפי data-column', () => {
    expect(locateInEditorFields([{ column: null, value: 'אמר (שלמם) [שלום] עליכם' }], report)).toMatchObject({ column: 'content', start: 4 })
    const two = [{ column: 'right', value: 'בלי' }, { column: 'left', value: 'אמר (שלמם)[שלום] עליכם' }]
    expect(locateInEditorFields(two, report)).toMatchObject({ column: 'left', start: 4, end: 16 })
    expect(locateInEditorFields([{ column: null, value: 'אין כאן' }], report)).toBeNull()
  })
})

describe('reportFocusNotice', () => {
  it('הודעה לכל מצב', () => {
    expect(reportFocusNotice({ phase: 'found', count: 1 }).text).toBe('הסימון של הדיווח מסומן בטקסט.')
    expect(reportFocusNotice({ phase: 'found', count: 3 }).text).toContain('3 סימונים')
    expect(reportFocusNotice({ phase: 'missing' }).tone).toBe('warning')
    expect(reportFocusNotice({ phase: 'otherPage' }).text).toContain('עמוד אחר')
    expect(reportFocusNotice({ phase: 'error', error: 'אין הרשאה' })).toEqual({ tone: 'error', text: 'אין הרשאה' })
    expect(reportFocusNotice({ phase: 'loading' }).tone).toBe('info')
  })
  it('תווית הסימון', () => {
    expect(reportMarkerLabel(report)).toBe(buildErrorMarker('שלמם', 'שלום'))
  })
})

describe('barPlacement', () => {
  it('סימון בחצי התחתון — הפס למעלה; אחרת למטה', () => {
    expect(barPlacement(700, 800)).toBe('top')
    expect(barPlacement(200, 800)).toBe('bottom')
    expect(barPlacement(NaN, 800)).toBe('bottom')
  })
})
