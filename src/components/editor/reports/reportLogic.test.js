import { describe, expect, it } from 'vitest'
import {
  buildErrorSubmission,
  buildMessageSubmission,
  canReportBookError,
  editorMenuModel,
  fieldColumn,
  markerDiff,
  messageCharsLeft,
  reportErrorMessage,
  reportStatusText,
  reportTarget,
} from './reportLogic'

describe('reportTarget', () => {
  it('בחירה — בלי רווחים בקצוות', () => {
    const v = 'אבג  דהו  זחט'
    expect(reportTarget(v, 3, 10)).toEqual({ start: 5, end: 8, text: 'דהו' })
  })

  it('בחירה הפוכה מטופלת', () => {
    expect(reportTarget('שלום עולם', 9, 5)).toEqual({ start: 5, end: 9, text: 'עולם' })
  })

  it('בלי בחירה — המילה שתחת הסמן', () => {
    expect(reportTarget('שלום עולם טוב', 7, 7)).toEqual({ start: 5, end: 9, text: 'עולם' })
  })

  it('הסמן מיד אחרי מילה — אותה מילה', () => {
    expect(reportTarget('שלום עולם', 4, 4)).toEqual({ start: 0, end: 4, text: 'שלום' })
  })

  it('בלי פיסוק וסוגריים בקצוות', () => {
    expect(reportTarget('אמר (שלום), והלך', 7, 7)).toEqual({ start: 5, end: 9, text: 'שלום' })
  })

  it('גרש בסוף מילה (קיצור) נשאר; מירכאות סוגרות לא', () => {
    expect(reportTarget("כתב תוס' כאן", 6, 6).text).toBe("תוס'")
    expect(reportTarget('אמר "שלום" לו', 6, 6).text).toBe('שלום')
    expect(reportTarget('אמר ר"ת כאן', 5, 5).text).toBe('ר"ת')
  })

  it('לא נכנס לתגי עיצוב', () => {
    expect(reportTarget('<b>שלום</b> עולם', 5, 5)).toEqual({ start: 3, end: 7, text: 'שלום' })
  })

  it('סמן בתוך תג או ברווח — טווח ריק', () => {
    expect(reportTarget('<big>שלום</big>', 2, 2)).toEqual({ start: 2, end: 2, text: '' })
    expect(reportTarget('אבג   דהו', 4, 4)).toEqual({ start: 4, end: 4, text: '' })
    expect(reportTarget('', 0, 0)).toEqual({ start: 0, end: 0, text: '' })
  })

  it('סמן בתחילת טקסט שמתחיל בתג', () => {
    expect(reportTarget('<b>שלום</b>', 0, 0).text).toBe('')
  })
})

describe('buildErrorSubmission', () => {
  const base = { bookPath: 'ספר', pageNumber: 3, column: null }

  it('מחליף את הבחירה בסימון, offset = מיקום הסימון, הקשר מהטקסט החדש', () => {
    const value = 'אמר רבי יהודה בשם רב'
    const res = buildErrorSubmission({ ...base, value, start: 8, end: 13, original: 'יהודה', proposed: 'יהודא', note: ' בדקתי ' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.newValue).toBe('אמר רבי (יהודה) [יהודא] בשם רב')
    expect(res.caret).toBe(8 + '(יהודה) [יהודא]'.length)
    expect(res.body).toMatchObject({
      kind: 'book_error', bookPath: 'ספר', pageNumber: 3, column: 'content',
      original: 'יהודה', proposed: 'יהודא', offset: 8,
      contextBefore: 'אמר רבי ', contextAfter: ' בשם רב', message: 'בדקתי',
    })
  })

  it('טור ימני/שמאלי נשלח כמו שהוא', () => {
    const res = buildErrorSubmission({ ...base, column: 'left', value: 'אבג', start: 0, end: 3, original: 'אבג', proposed: 'אבד' })
    expect(res.ok && res.body.column).toBe('left')
  })

  it('עריכת "הטקסט שבספר" שונה מהבחירה נדחית, כדי לא לכתוב מחדש את העמוד בשקט', () => {
    const res = buildErrorSubmission({ ...base, value: 'אבג', start: 0, end: 3, original: 'אבדדד', proposed: 'אבד' })
    expect(res.ok).toBe(false)
  })

  it('ולידציה בעברית (rules.js)', () => {
    const same = buildErrorSubmission({ ...base, value: 'אבג', start: 0, end: 3, original: 'אבג', proposed: 'אבג' })
    expect(same).toEqual({ ok: false, error: 'התיקון המוצע זהה לטקסט שבספר' })
    const paren = buildErrorSubmission({ ...base, value: '(א)', start: 0, end: 3, original: '(א)', proposed: 'א' })
    expect(paren.ok).toBe(false)
  })

  it('תגי עיצוב בדיווח — שגיאה', () => {
    const res = buildErrorSubmission({ ...base, value: 'א<b>ב</b>', start: 0, end: 8, original: 'א<b>ב', proposed: 'אב' })
    expect(res.ok).toBe(false)
  })

  it('הטווח שמוחלף כולל תג או מעבר שורה — שגיאה (גם כש"הטקסט שבספר" נקי)', () => {
    const tag = buildErrorSubmission({ ...base, value: 'א<b>ב</b>', start: 0, end: 8, original: 'אב', proposed: 'אג' })
    expect(tag.ok).toBe(false)
    const nl = buildErrorSubmission({ ...base, value: 'אב\nגד', start: 0, end: 5, original: 'אבגד', proposed: 'אבגה' })
    expect(nl).toEqual({ ok: false, error: 'אפשר לדווח רק על טקסט שבשורה אחת. סמנו קטע קצר יותר.' })
  })

  it('ניקוד וסוגריים מרובעים בטקסט שבספר — נשמרים בסימון', () => {
    const value = 'בְּרֵאשִׁית [א] בָּרָא'
    const end = value.indexOf(' בָּרָא')
    const original = value.slice(0, end)
    const res = buildErrorSubmission({ ...base, value, start: 0, end, original, proposed: 'בְּרֵאשִׁית ב' })
    expect(res.ok && res.newValue).toBe(`(${original}) [בְּרֵאשִׁית ב] בָּרָא`)
    expect(res.ok && res.body.original).toBe(original)
  })

  it('טווח ריק — הסימון נכנס במקום הסמן (תיקון בלבד)', () => {
    const res = buildErrorSubmission({ ...base, value: 'אב גד', start: 2, end: 2, original: '', proposed: 'ו' })
    expect(res.ok && res.newValue).toBe('אב() [ו] גד')
  })
})

describe('buildMessageSubmission / messageCharsLeft', () => {
  it('הודעה ריקה — שגיאה; תקינה — גוף', () => {
    expect(buildMessageSubmission({ bookPath: 'ס', pageNumber: 1, message: '  ' }).ok).toBe(false)
    expect(buildMessageSubmission({ bookPath: 'ס', pageNumber: 1, message: ' שלום ' }))
      .toEqual({ ok: true, body: { kind: 'message', bookPath: 'ס', pageNumber: 1, message: 'שלום' } })
  })

  it('מונה תווים', () => {
    expect(messageCharsLeft('')).toBe(2000)
    expect(messageCharsLeft('x'.repeat(2001))).toBe(-1)
  })
})

describe('markerDiff', () => {
  it('אות אחת שהשתנתה באמצע', () => {
    expect(markerDiff('יהודה', 'יהודא')).toEqual({ prefix: 'יהוד', removed: 'ה', added: 'א', suffix: '' })
  })
  it('הוספה בלבד', () => {
    expect(markerDiff('אבד', 'אבגד')).toEqual({ prefix: 'אב', removed: '', added: 'ג', suffix: 'ד' })
  })
  it('זהים', () => {
    expect(markerDiff('אב', 'אב')).toEqual({ prefix: 'אב', removed: '', added: '', suffix: '' })
  })
})

describe('הרשאות ותפריט', () => {
  it('canReportBookError', () => {
    expect(canReportBookError({ claimState: 'mine', role: 'user' })).toBe(true)
    expect(canReportBookError({ claimState: 'available', role: 'admin_books' })).toBe(true)
    expect(canReportBookError({ claimState: 'other', role: 'user' })).toBe(false)
  })

  it('fieldColumn', () => {
    expect(fieldColumn('right')).toBe('right')
    expect(fieldColumn(null)).toBe('content')
  })

  it('editorMenuModel — לא מורשה: הדיווח מושבת עם הסבר', () => {
    const items = editorMenuModel({ hasSelection: true, canReport: false, online: true })
    const report = items.find((i) => i.id === 'reportError')
    expect(report.disabled).toBe(true)
    expect(report.hint).toMatch(/תפס/)
    const allowed = editorMenuModel({ hasSelection: true, canReport: true, online: true }).find((i) => i.id === 'reportError')
    expect(allowed.hint).toEqual(['רק לטעות שבספר עצמו, כפי שמופיעה בצילום', 'טעות זיהוי (OCR) מתקנים ישירות בטקסט'])
    expect(items.find((i) => i.id === 'pageMessage').disabled).toBe(false)
  })

  it('editorMenuModel — בלי בחירה: גזור/העתק מושבתים, הדבק פעיל', () => {
    const items = editorMenuModel({ hasSelection: false, canReport: true, online: true })
    expect(items.find((i) => i.id === 'cut').disabled).toBe(true)
    expect(items.find((i) => i.id === 'copy').disabled).toBe(true)
    expect(items.find((i) => i.id === 'paste').disabled).toBeFalsy()
    expect(items.find((i) => i.id === 'reportError').hint).toEqual(['על המילה שתחת הסמן', 'רק לטעות שבספר עצמו, כפי שמופיעה בצילום', 'טעות זיהוי (OCR) מתקנים ישירות בטקסט'])
  })

  it('editorMenuModel — בלי רשת: שני הדיווחים מושבתים', () => {
    const items = editorMenuModel({ hasSelection: true, canReport: true, online: false })
    expect(items.find((i) => i.id === 'reportError').disabled).toBe(true)
    expect(items.find((i) => i.id === 'pageMessage').disabled).toBe(true)
  })

  it('reportErrorMessage / reportStatusText', () => {
    expect(reportErrorMessage(400, { error: 'שגיאה מהשרת' })).toBe('שגיאה מהשרת')
    expect(reportErrorMessage(429, null)).toMatch(/רבים/)
    expect(reportStatusText('approved').label).toBe('אושר')
    expect(reportStatusText('x').label).toBe('לא ידוע')
  })
})
