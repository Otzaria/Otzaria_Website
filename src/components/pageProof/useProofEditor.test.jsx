import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useProofEditor, COALESCE_MS, mapCaretOffset, rebaseOps } from './useProofEditor'
import { SEG_OK } from '@/lib/pageProof/textModel'
import { tempLineId } from '@/lib/pageProof/ops'

const P = 3
const line = (id, text, extra = {}) => ({ id, order: id, line_no: id - 1, bbox: [100, id * 50, 900, id * 50 + 40], text, text_ocr: text, status: 'pending', stream: 'main', words: [], ...extra })
const doc = { page: P, size: [1000, 1000], lines: [line(1, 'אלף בית'), line(2, 'גימל דלת')] }
const KEY = 'page-proof-draft:p1:1:abc'
const text = (id, value) => ({ kind: 'text', page: P, ids: [id], value })

const setup = (props = {}) => renderHook((p) => useProofEditor({ baseDoc: doc, draftKey: KEY, ...p }), { initialProps: props })

describe('useProofEditor', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.useRealTimers())

  it('קבוצה: כמה פעולות ב-push אחד — Ctrl+Z אחד מבטל את כולן, Redo מחזיר', () => {
    const { result } = setup()
    act(() => {
      result.current.push({ kind: 'line_ok', page: P, ids: [1] }, { kind: 'line_ok', page: P, ids: [2] })
    })
    expect(result.current.ops).toHaveLength(2)
    act(() => result.current.undo())
    expect(result.current.ops).toHaveLength(0)
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.redo())
    expect(result.current.ops.map((o) => o.ids[0])).toEqual([1, 2])
  })

  it('צבירת-הקלדה: הקלדה רצופה באותה שורה מחליפה את פעולת-הטקסט הקודמת; הפסקה של 2 שניות — פעולה חדשה', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'))
    const { result } = setup()
    act(() => {
      result.current.push(text(1, 'אלף ביתא'), { coalesceKey: 'text:1' })
    })
    vi.setSystemTime(new Date(Date.now() + 500))
    act(() => {
      result.current.push(text(1, 'אלף ביתאב'), { coalesceKey: 'text:1' })
    })
    expect(result.current.ops).toHaveLength(1)
    expect(result.current.ops[0].value).toBe('אלף ביתאב')
    expect(result.current.view.lines[0].text).toBe('אלף ביתאב')
    // שורה אחרת — לא מצטבר
    act(() => {
      result.current.push(text(2, 'גימל'), { coalesceKey: 'text:2' })
    })
    expect(result.current.ops).toHaveLength(2)
    // חזרה לשורה 1: הפעולה האחרונה כבר אינה שלה — חדשה
    act(() => {
      result.current.push(text(1, 'אלף'), { coalesceKey: 'text:1' })
    })
    expect(result.current.ops).toHaveLength(3)
    vi.setSystemTime(new Date(Date.now() + COALESCE_MS + 1))
    act(() => {
      result.current.push(text(1, 'אלפ'), { coalesceKey: 'text:1' })
    })
    expect(result.current.ops).toHaveLength(4)
    // Ctrl+Z מבטל "פרץ" שלם
    act(() => result.current.undo())
    expect(result.current.view.lines[0].text).toBe('אלף')
  })

  it('פעולה לא תקינה נדחית עם הודעה בעברית, והרשימה לא משתנה', () => {
    const { result } = setup()
    let ok
    act(() => {
      ok = result.current.push({ kind: 'text', page: P, ids: [99], value: 'x' })
    })
    expect(ok).toBe(false)
    expect(result.current.error).toMatch(/שורה/)
    expect(result.current.ops).toHaveLength(0)
  })

  it('פעולות מקומיות (חצי-אישור): בתצוגה (_segOk) ובטיוטה, אבל לא ב-ops ולא בבדיקת-התקינות', () => {
    const { result } = setup()
    act(() => {
      result.current.push({ kind: SEG_OK, page: P, ids: [1], value: 0, _local: true }, { kind: 'line_ok', page: P, ids: [2] })
    })
    expect(result.current.ops.map((o) => o.kind)).toEqual(['line_ok'])
    expect(result.current.allOps).toHaveLength(2)
    expect([...result.current.view._segOk]).toEqual(['1:0'])
    const saved = JSON.parse(window.localStorage.getItem(KEY))
    expect(saved.ops).toHaveLength(2)
  })

  it('removeWhere: הסרה מלאה, או הוצאת מזהים מתוך פעולה על כמה שורות', () => {
    const { result } = setup()
    act(() => {
      result.current.push({ kind: 'line_ok', page: P, ids: [1, 2] })
    })
    act(() => {
      result.current.push(text(2, 'גימל'))
    })
    act(() => result.current.removeWhere((op) => (op.kind === 'line_ok' ? [1] : false)))
    expect(result.current.ops).toEqual([expect.objectContaining({ kind: 'line_ok', ids: [2] }), expect.objectContaining({ kind: 'text' })])
    act(() => result.current.removeWhere((op) => op.kind === 'text'))
    expect(result.current.ops.map((o) => o.kind)).toEqual(['line_ok'])
  })

  it('טיוטה: נשמרת ונקראת במפתח draftKey בלבד; בלי persist או בתצוגה בלבד — לא', () => {
    window.localStorage.setItem('page-proof-draft:p1', JSON.stringify({ ops: [text(1, 'ישן')] }))
    window.localStorage.setItem(KEY, JSON.stringify({ ops: [text(1, 'טיוטה')] }))
    const { result } = setup()
    expect(result.current.restored).toBe(true)
    expect(result.current.view.lines[0].text).toBe('טיוטה')
    act(() => result.current.reset())
    expect(window.localStorage.getItem(KEY)).toBeNull()

    window.localStorage.setItem(KEY, JSON.stringify({ ops: [text(1, 'טיוטה')] }))
    const ro = setup({ readOnly: true, initialOps: [text(2, 'הגשה')] })
    expect(ro.result.current.restored).toBe(false)
    expect(ro.result.current.view.lines[1].text).toBe('הגשה')
    let pushed
    act(() => {
      pushed = ro.result.current.push(text(1, 'x'))
    })
    expect(pushed).toBe(false)
  })

  it('removeAt: לפי המקום ברשימת השינויים (בלי המקומיות); Ctrl+Z מחזיר', () => {
    const { result } = setup()
    act(() => {
      result.current.push({ kind: SEG_OK, page: P, ids: [1], value: 0, _local: true })
    })
    act(() => {
      result.current.push(text(1, 'א'))
    })
    act(() => {
      result.current.push(text(2, 'ב'))
    })
    act(() => result.current.removeAt(0))
    expect(result.current.ops.map((o) => o.value)).toEqual(['ב'])
    expect(result.current.allOps).toHaveLength(2)
    act(() => result.current.undo())
    expect(result.current.ops.map((o) => o.value)).toEqual(['א', 'ב'])
  })

  it('פרץ-הקלדה שחזר לטקסט שלפניו (אות ומחיקתה מיד) — יורד כולו, בלי צעד-ביטול', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'))
    const { result } = setup()
    act(() => {
      result.current.push({ kind: 'line_ok', page: P, ids: [2] })
    })
    act(() => {
      result.current.push(text(1, 'אלף ביתק'), { coalesceKey: 'text:1' })
    })
    vi.setSystemTime(new Date(Date.now() + 400))
    act(() => {
      result.current.push(text(1, 'אלף בית'), { coalesceKey: 'text:1' })
    })
    expect(result.current.ops.map((o) => o.kind)).toEqual(['line_ok'])
    expect(result.current.view.lines[0]._textEdited).toBeFalsy()
    // Ctrl+Z הבא מבטל את מה שהיה לפני הפרץ
    act(() => result.current.undo())
    expect(result.current.ops).toEqual([])
    expect(result.current.canUndo).toBe(false)
  })

  it('תיקון שחזר לטקסט שיובא בשתי פעולות נפרדות — השורה אינה "מתוקנת" (נשארת לאישור-השאר)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-29T10:00:00Z'))
    const { result } = setup()
    act(() => {
      result.current.push(text(1, 'אלף ביתק'), { coalesceKey: 'text:1' })
    })
    vi.setSystemTime(new Date(Date.now() + COALESCE_MS + 1))
    act(() => {
      result.current.push(text(1, 'אלף בית'), { coalesceKey: 'text:1' })
    })
    expect(result.current.ops).toHaveLength(2)
    expect(result.current.view.lines[0]._textEdited).toBe(false)
    act(() => {
      result.current.push(text(2, 'גימל'))
    })
    expect(result.current.view.lines[1]._textEdited).toBe(true)
  })

  it('removeWhere (ביטול אישור פסקה) הוא צעד-ביטול: Ctrl+Z מחזיר את האישור ולא מבטל תיקון ישן', () => {
    const { result } = setup()
    act(() => {
      result.current.push(text(1, 'אלף ביתא'))
    })
    act(() => {
      result.current.push({ kind: 'line_ok', page: P, ids: [1] }, { kind: 'line_ok', page: P, ids: [2] })
    })
    act(() => result.current.removeWhere((op) => op.kind === 'line_ok'))
    expect(result.current.ops.map((o) => o.kind)).toEqual(['text'])
    act(() => result.current.undo())
    expect(result.current.ops.map((o) => o.kind)).toEqual(['text', 'line_ok', 'line_ok'])
    expect(result.current.view.lines[0].text).toBe('אלף ביתא')
    act(() => result.current.redo())
    expect(result.current.ops.map((o) => o.kind)).toEqual(['text'])
    // הסרה שלא מצאה כלום — אינה צעד
    act(() => result.current.removeWhere(() => false))
    act(() => result.current.undo())
    expect(result.current.ops.map((o) => o.kind)).toEqual(['text', 'line_ok', 'line_ok'])
  })

  it('removeWhere: pred.add — פעולות (מקומיות) שנוספות באותו צעד', () => {
    const { result } = setup()
    act(() => {
      result.current.push({ kind: 'line_ok', page: P, ids: [1] })
    })
    const pred = (op) => op.kind === 'line_ok'
    pred.add = [{ kind: SEG_OK, page: P, ids: [1], value: 1, _local: true }, { kind: 'text', page: P, ids: [99], value: 'x' }]
    act(() => result.current.removeWhere(pred))
    expect(result.current.ops).toEqual([])
    expect(result.current.allOps).toEqual([expect.objectContaining({ kind: SEG_OK, value: 1 })])
    act(() => result.current.undo())
    expect(result.current.ops.map((o) => o.kind)).toEqual(['line_ok'])
  })

  it('_preOk: במעבר שני (יש שורות recheck) — שורות ok/fixed מהסבב הקודם; במעבר ראשון — אין', () => {
    const pass2 = { ...doc, lines: [{ ...doc.lines[0], status: 'fixed' }, { ...doc.lines[1], recheck: true }, line(3, 'עוד', { status: 'ok' })] }
    const two = renderHook(() => useProofEditor({ baseDoc: pass2, draftKey: KEY }))
    expect([...two.result.current.view._preOk]).toEqual([1, 3])
    const pass1 = { ...doc, lines: [{ ...doc.lines[0], status: 'ok' }, doc.lines[1]] }
    const one = renderHook(() => useProofEditor({ baseDoc: pass1, draftKey: KEY }))
    expect(one.result.current.view._preOk.size).toBe(0)
  })
})

// דף עוטף ששומר בשרת כל צעד (תוכנת-הספר): מזהי-צעד, flushable, rebase, preOkFromStatus.
// באתר אף אחד מהם אינו נקרא — הבדיקות שלמעלה (בלי השדות האלה) הן ההתנהגות של האתר.
describe('useProofEditor — שמירה בשרת לכל צעד (דף עוטף)', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.useRealTimers())
  const book = (props = {}) => renderHook((p) => useProofEditor({ baseDoc: doc, persist: false, ...p }), { initialProps: props })
  const serverDoc = (lines) => ({ ...doc, lines })

  it('מזהה-צעד (_s) לכל push; push של כמה פעולות — מזהה אחד; הקלדה מצטברת — מזהה חדש בכל הקשה', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T10:00:00Z'))
    const { result } = book()
    act(() => {
      result.current.push({ kind: 'line_ok', page: P, ids: [1] }, { kind: 'line_ok', page: P, ids: [2] })
    })
    const [a, b] = result.current.allOps
    expect(a._s).toBeTruthy()
    expect(b._s).toBe(a._s)
    act(() => {
      result.current.push(text(1, 'אלף ביתא'), { coalesceKey: 'text:1' })
    })
    const first = result.current.allOps[2]._s
    expect(first).not.toBe(a._s)
    vi.setSystemTime(new Date(Date.now() + 300))
    act(() => {
      result.current.push(text(1, 'אלף ביתאב'), { coalesceKey: 'text:1' })
    })
    expect(result.current.allOps).toHaveLength(3)
    expect(result.current.allOps[2]._s).not.toBe(first)
  })

  it('flushable: צעדים לפי הסדר, בלי המקומיות; פרץ-הקלדה פתוח נשאר בחוץ (אלא אם all); skip; מזהים זמניים לחיתוך', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T10:00:00Z'))
    const { result } = book()
    act(() => {
      result.current.push({ kind: SEG_OK, page: P, ids: [1], value: 0, _local: true }, { kind: 'line_ok', page: P, ids: [2] })
    })
    act(() => {
      result.current.push({ kind: 'line_split', page: P, ids: [1], value: { x: 500 } })
    })
    act(() => {
      result.current.push(text(2, 'גימל דלתא'), { coalesceKey: 'text:2' })
    })
    let f = result.current.flushable()
    expect(f.held).toBe(1)
    expect(f.steps.map((s) => s.ops.map((o) => o.kind))).toEqual([['line_ok'], ['line_split']])
    // ה-split הוא הפעולה השנייה שאינה מקומית (אינדקס 1) — כמו buildView
    expect(f.steps[1].tmp).toEqual([[tempLineId(1, 0), tempLineId(1, 1)]])
    expect(result.current.view.lines.map((l) => l.id)).toEqual(expect.arrayContaining([tempLineId(1, 0), tempLineId(1, 1)]))
    f = result.current.flushable({ all: true })
    expect(f.held).toBe(0)
    expect(f.steps.map((s) => s.ops[0].kind)).toEqual(['line_ok', 'line_split', 'text'])
    // אחרי COALESCE_MS הפרץ כבר סגור — יוצא גם בלי all
    vi.setSystemTime(new Date(Date.now() + COALESCE_MS + 1))
    expect(result.current.flushable().steps).toHaveLength(3)
    expect(result.current.flushable({ skip: new Set([f.steps[0].sid]) }).steps.map((s) => s.ops[0].kind)).toEqual(['line_split', 'text'])
  })

  it('פעולה נלווית (_cmp, "לספר בלבד"): הפרץ ממשיך אחריה, Ctrl+Z אחד מוריד את שתיהן; פרץ פתוח נשמר יחד עם הנלווית', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'))
    const { result } = book()
    const mark = { kind: 'train_text', page: P, ids: [2], value: 0, _cmp: true }
    act(() => {
      result.current.push(mark, text(2, 'גימל דלתא'), { coalesceKey: 'text:2' })
    })
    vi.setSystemTime(new Date(Date.now() + 500))
    act(() => {
      result.current.push(text(2, 'גימל דלתאב'), { coalesceKey: 'text:2' })
    })
    expect(result.current.ops.map((o) => [o.kind, o.value])).toEqual([['train_text', 0], ['text', 'גימל דלתאב']])
    expect(result.current.view.lines[1].train_text).toBe(0)
    // פרץ פתוח — גם הנלווית שלו בחוץ (אחרת הסימון היה נשמר בלי הטקסט)
    expect(result.current.flushable().steps).toEqual([])
    // ...ואחרי שנסגר — צעד אחד (מזהה-צעד אחד לטקסט ולסימון: Undo אחד גם בשרת)
    expect(result.current.flushable({ all: true }).steps.map((s) => s.ops.map((o) => o.kind))).toEqual([['train_text', 'text']])
    act(() => result.current.undo())
    expect(result.current.ops).toEqual([])
    // פרץ שחזר לטקסט שלפניו — יורד עם הנלווית שלו
    act(() => {
      result.current.push({ ...mark }, text(2, 'גימל דלתא'), { coalesceKey: 'text:2' })
    })
    vi.setSystemTime(new Date(Date.now() + 300))
    act(() => {
      result.current.push(text(2, 'גימל דלת'), { coalesceKey: 'text:2' })
    })
    expect(result.current.ops).toEqual([])
  })

  it('rebase: מה שנשלח יורד, מה שנוסף בינתיים נשאר ונבדק שוב, העמוד מתחלף, ההיסטוריה המקומית מתאפסת', () => {
    const { result } = book()
    act(() => {
      result.current.push(text(1, 'אלף בית מתוקן'))
    })
    const sent = result.current.flushable().steps
    act(() => {
      result.current.push(text(2, 'גימל דלת מתוקן'))
    })
    act(() => {
      result.current.push({ kind: 'line_ok', page: P, ids: [1] })
    })
    expect(result.current.canUndo).toBe(true)
    // השרת החיל את הצעד הראשון; שורה 2 נמחקה שם בינתיים (מסך אחר)
    const fresh = serverDoc([{ ...doc.lines[0], text: 'אלף בית מתוקן' }])
    let r
    let before
    act(() => {
      r = result.current.rebase(fresh, { drop: sent.map((s) => s.sid) })
      // מיד (לפני הרינדור): מה שנשלח כבר לא "ממתין" — אחרת היה נשלח פעמיים
      before = result.current.flushable({ all: true }).steps.map((s) => s.ops[0].kind)
    })
    expect(before).toEqual(['line_ok'])
    expect(result.current.baseDoc).toBe(fresh)
    expect(result.current.ops.map((o) => o.kind)).toEqual(['line_ok'])
    expect(r.dropped).toEqual([{ op: expect.objectContaining({ kind: 'text', ids: [2] }), error: expect.stringMatching(/שורה/) }])
    expect(result.current.view.lines[0].text).toBe('אלף בית מתוקן')
    expect(result.current.view.lines[0]._textEdited).toBeFalsy()
    expect(result.current.canRedo).toBe(false)
    // Ctrl+Z מקומי: רק מה שלא נשמר (אין צילומים — הקבוצה האחרונה)
    act(() => {
      result.current.undo()
    })
    expect(result.current.ops).toEqual([])
    expect(result.current.undo()).toBeNull()
  })

  it('rebase: פעולה מקומית נשארת רק אם השורה שלה עוד בעמוד; תיקון שכבר זהה לעמוד — יורד בשקט', () => {
    const { result } = book()
    act(() => {
      result.current.push({ kind: SEG_OK, page: P, ids: [1], value: 1, _local: true }, { kind: SEG_OK, page: P, ids: [2], value: 1, _local: true })
    })
    act(() => {
      result.current.push(text(1, 'אלף בית ג'))
    })
    let r
    act(() => {
      r = result.current.rebase(serverDoc([{ ...doc.lines[0], text: 'אלף בית ג' }]), { drop: [] })
    })
    expect(r.dropped).toEqual([])
    expect(result.current.allOps).toEqual([expect.objectContaining({ kind: SEG_OK, ids: [1] })])
  })

  it('rebase: מיפוי-המזהים — מהשרת (מחרוזות), ומזהים זמניים של חיתוך שנשאר ומקומו ברשימה זז', () => {
    const { result } = book()
    act(() => {
      result.current.push(text(2, 'גימל'))
    })
    act(() => {
      result.current.push({ kind: 'line_split', page: P, ids: [1], value: { x: 500 } })
    })
    const first = result.current.flushable().steps[0].sid
    let r
    act(() => {
      r = result.current.rebase(serverDoc([doc.lines[0], { ...doc.lines[1], text: 'גימל' }]), { drop: [first], idMap: { '-1': 1, '-2': 7 } })
    })
    // השרת מיפה (מחרוזות ← מספרים); ה-split עבר ממקום 1 למקום 0 ברשימה: -11/-12 ← -1/-2
    expect(r.idMap).toEqual({ '-1': 1, '-2': 7, [tempLineId(1, 0)]: tempLineId(0, 0), [tempLineId(1, 1)]: tempLineId(0, 1) })
    expect(result.current.view.lines.map((l) => l.id)).toEqual(expect.arrayContaining([tempLineId(0, 0), tempLineId(0, 1), 2]))
    expect(r.textOf(2)).toBe('גימל')
    const second = { id: 7, order: 3, line_no: 2, bbox: [100, 100, 500, 140], text: 'בית', text_ocr: 'בית', status: 'pending', stream: 'main', words: [] }
    let r2
    act(() => {
      r2 = result.current.rebase(serverDoc([doc.lines[0], second]), {
        drop: result.current.flushable().steps.map((s) => s.sid),
        idMap: { [tempLineId(0, 0)]: 1, [tempLineId(0, 1)]: 7 },
      })
    })
    expect(r2.idMap).toEqual({ [tempLineId(0, 0)]: 1, [tempLineId(0, 1)]: 7 })
    expect(r2.textOf(7)).toBe('בית')
    expect(result.current.ops).toEqual([])
  })

  it('rebase: prop חדש של העמוד גובר על העמוד שהשרת החזיר; בתצוגה בלבד — אין rebase', () => {
    const { result, rerender } = book()
    const fresh = serverDoc([{ ...doc.lines[0], text: 'מהשרת' }, doc.lines[1]])
    act(() => {
      result.current.rebase(fresh, { drop: [] })
    })
    expect(result.current.view.lines[0].text).toBe('מהשרת')
    const other = serverDoc([{ ...doc.lines[0], text: 'עמוד חדש' }, doc.lines[1]])
    rerender({ baseDoc: other })
    expect(result.current.baseDoc).toBe(other)
    expect(result.current.view.lines[0].text).toBe('עמוד חדש')
    const ro = renderHook(() => useProofEditor({ baseDoc: doc, readOnly: true }))
    expect(ro.result.current.rebase(fresh, {})).toBeNull()
    expect(ro.result.current.baseDoc).toBe(doc)
  })

  it('preOkFromStatus: שורות ok/fixed מאושרות גם בלי מעבר שני (בלי recheck); שורה עם recheck — לא', () => {
    const lines = [{ ...doc.lines[0], status: 'fixed' }, { ...doc.lines[1], status: 'ok' }, line(3, 'עוד', { status: 'pending' })]
    const pass1 = { ...doc, lines }
    const site = renderHook(() => useProofEditor({ baseDoc: pass1, draftKey: KEY }))
    expect(site.result.current.view._preOk.size).toBe(0)
    const bk = renderHook(() => useProofEditor({ baseDoc: pass1, persist: false, preOkFromStatus: true }))
    expect([...bk.result.current.view._preOk]).toEqual([1, 2])
    const rc = { ...doc, lines: [lines[0], { ...lines[1], recheck: true }, lines[2]] }
    const bk2 = renderHook(() => useProofEditor({ baseDoc: rc, persist: false, preOkFromStatus: true }))
    expect([...bk2.result.current.view._preOk]).toEqual([1])
  })

  it('rebaseOps / mapCaretOffset — טהורים', () => {
    const a = { ...text(1, 'x'), _s: 's1' }
    const b = { ...text(2, 'גימל דלת'), _s: 's2' }
    expect(rebaseOps(doc, [a, b], new Set(['s1'])).kept).toEqual([])
    expect(rebaseOps(doc, [a, b], new Set([a])).kept).toEqual([])
    expect(rebaseOps(doc, [a], new Set()).kept).toEqual([a])
    // כיווץ-רווחים של השרת: הסמן אחרי אותן אותיות
    expect(mapCaretOffset('אלף  בית', 'אלף בית', 5)).toBe(4)
    expect(mapCaretOffset('אלף בית ', 'אלף בית', 8)).toBe(7)
    expect(mapCaretOffset(' אלף', 'אלף', 2)).toBe(1)
    expect(mapCaretOffset('אלף בית', 'אלף בית', 3)).toBe(3)
    expect(mapCaretOffset('אלף', 'אלף בית גימל', 99)).toBe(3)
  })
})
