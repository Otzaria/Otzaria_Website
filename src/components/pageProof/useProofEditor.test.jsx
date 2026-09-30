import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useProofEditor, COALESCE_MS } from './useProofEditor'
import { SEG_OK } from '@/lib/pageProof/textModel'

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
