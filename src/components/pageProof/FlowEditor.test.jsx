import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { buildView, recutLineIds } from '@/lib/pageProof/ops'
import { paragraphApproval, FURNITURE_TAB } from '@/lib/pageProof/textModel'
import { linkEndpoints } from '@/lib/pageProof/flowEdit'
import { setDomSelection } from './flowDom'
import FlowEditor from './FlowEditor'

const P = 4
const W = (text) => text.split(/\s+/).filter(Boolean).map((t) => ({ text: t, styles: [] }))
const L = (id, order, text, extra = {}) => ({
  id,
  order,
  line_no: id - 1,
  bbox: [100, order * 50, 900, order * 50 + 40],
  text,
  text_ocr: text,
  stream: 'main',
  status: 'pending',
  words: W(text),
  ...extra,
})
const base = () => ({
  page: P,
  size: [1000, 2000],
  lines: [
    L(1, 1, 'כותרת הפרק', { stream: 'main_heading' }),
    L(2, 2, 'אלף בית גימל', { para_start: true }),
    L(3, 3, 'דלת הא וו', { para_start: true }),
    L(4, 4, 'זין חית טית יוד', { para_breaks: [2] }),
    L(5, 5, 'הערה ראשונה', { stream: 'notes', para_start: true }),
    L(6, 6, '12', { stream: 'header' }),
  ],
  links: [{ from_line: 5, to_line: 2, to_page: P, kind: 'note', from_words: [0, 0], to_words: [1, 1] }],
})

function setup({ ops = [], tabKey = 'main', readOnly = false, push = vi.fn(() => true), ...rest } = {}) {
  const doc = base()
  const view = buildView(doc, ops)
  const locked = new Set(recutLineIds(doc, ops))
  const props = {
    view,
    tabKey,
    push,
    readOnly,
    locked,
    approval: tabKey === FURNITURE_TAB ? null : paragraphApproval(view, tabKey, { locked }),
    endpoints: linkEndpoints(view),
    onHint: vi.fn(),
    onApprove: vi.fn(),
    onUnapprove: vi.fn(),
    onSelect: vi.fn(),
    ...rest,
  }
  const utils = render(<FlowEditor {...props} />)
  const root = screen.getByRole('textbox')
  return { ...utils, root, props, push }
}

const beforeInput = (root, init) => {
  const e = new InputEvent('beforeinput', { bubbles: true, cancelable: true, ...init })
  act(() => {
    root.dispatchEvent(e)
  })
  return e
}

describe('FlowEditor — הטקסט הזורם', { timeout: 20000 }, () => {
  it('מציג רק את פסקאות הלשונית הפעילה, בשורות ובמילים', () => {
    const { root } = setup()
    const paras = root.querySelectorAll('[data-para]')
    expect([...paras].map((p) => p.dataset.para)).toEqual(['1:0', '2:0', '3:0', '4:2'])
    expect(root.textContent).toContain('אלף בית גימל')
    expect(root.textContent).not.toContain('הערה ראשונה')
    expect(root.querySelectorAll('[data-line="4"]')).toHaveLength(2)
    expect(root.querySelector('[data-line="2"] [data-w="2"]').textContent).toBe('גימל')
    expect(root).toHaveAttribute('contenteditable', 'true')
    // קישור: מספר קטן אחרי המילה בגוף (בלי טקסט ב-DOM — ב-CSS)
    const badge = root.querySelector('[data-line="2"] [data-w="1"] [data-badge]')
    expect(badge).toHaveAttribute('data-badge', '①')
    expect(badge.textContent).toBe('')
  })

  it('לשונית ההערות: רק הזרם שלה', () => {
    const { root } = setup({ tabKey: 'notes' })
    expect(root.textContent).toContain('הערה ראשונה')
    expect(root.textContent).not.toContain('אלף')
  })

  it('beforeinput insertText ← פעולת text לשורה, עם מפתח-צבירה, והדפדפן לא משנה את ה-DOM', () => {
    const { root, push } = setup()
    setDomSelection(root, { anchor: { lineId: 2, offset: 3 }, focus: { lineId: 2, offset: 3 } })
    const e = beforeInput(root, { inputType: 'insertText', data: 'ף' })
    expect(e.defaultPrevented).toBe(true)
    expect(push).toHaveBeenCalledWith({ kind: 'text', page: P, ids: [2], value: 'אלףף בית גימל' }, { coalesceKey: 'text:2' })
    expect(root.textContent).toContain('אלף בית גימל')
  })

  it('Enter באמצע שורה ← פסקה חדשה מהמילה (para_break)', () => {
    const { root, push } = setup()
    setDomSelection(root, { anchor: { lineId: 3, offset: 3 }, focus: { lineId: 3, offset: 3 } })
    beforeInput(root, { inputType: 'insertParagraph' })
    expect(push).toHaveBeenCalledWith({ kind: 'para_break', page: P, ids: [3], value: { word: 1, on: true } }, null)
  })

  it('Backspace בגבול רגיל בין שתי שורות של פסקה — בלי פעולה, עם הסבר', () => {
    const doc = base()
    doc.lines[2].para_start = false // שורה 3 ממשיכה את הפסקה של שורה 2
    const view = buildView(doc)
    const push = vi.fn(() => true)
    const onHint = vi.fn()
    render(<FlowEditor view={view} tabKey="main" push={push} onHint={onHint} approval={paragraphApproval(view, 'main')} />)
    const root = screen.getByRole('textbox')
    setDomSelection(root, { anchor: { lineId: 3, offset: 0 }, focus: { lineId: 3, offset: 0 } })
    beforeInput(root, { inputType: 'deleteContentBackward' })
    expect(push).not.toHaveBeenCalled()
    expect(onHint).toHaveBeenCalledWith('זה סוף-שורה בסריקה — אי אפשר למחוק אותו כאן')
  })

  it('שורה שממתינה לזיהוי מחדש: לא ניתנת לעריכה, עם תווית; הקלדה בה — רמז בלבד', () => {
    const { root, push, props } = setup({ ops: [{ kind: 'bbox', page: P, ids: [3], value: [100, 150, 900, 190] }] })
    const seg = root.querySelector('[data-line="3"]')
    expect(seg).toHaveAttribute('contenteditable', 'false')
    expect(seg).toHaveAttribute('data-label', 'ממתינה לזיהוי מחדש')
    setDomSelection(root, { anchor: { lineId: 3, offset: 1 }, focus: { lineId: 3, offset: 1 } })
    beforeInput(root, { inputType: 'insertText', data: 'x' })
    expect(push).not.toHaveBeenCalled()
    expect(props.onHint).toHaveBeenCalledWith('השורה ממתינה לזיהוי מחדש — אין טעם להקליד בה')
  })

  it('✓ ליד פסקה: אישור / ביטול-אישור; פסקה מאושרת מסומנת', () => {
    const { root, props, rerender } = setup()
    const gutter = root.querySelector('[data-para="3:0"] [data-gutter]')
    expect(gutter).toHaveAccessibleName('אישור הפסקה — כל השורות בה נכונות')
    fireEvent.click(gutter)
    expect(props.onApprove).toHaveBeenCalledWith('3:0')

    const view = buildView(base(), [{ kind: 'line_ok', page: P, ids: [2] }])
    rerender(<FlowEditor {...props} view={view} approval={paragraphApproval(view, 'main')} />)
    const p = root.querySelector('[data-para="2:0"]')
    expect(p).toHaveAttribute('data-approved', '1')
    fireEvent.click(p.querySelector('[data-gutter]'))
    expect(props.onUnapprove).toHaveBeenCalledWith('2:0')
  })

  it('תצוגה בלבד: לא ניתן לעריכה, וה-✓ מושבת', () => {
    const { root, push } = setup({ readOnly: true })
    expect(root).toHaveAttribute('contenteditable', 'false')
    expect(root.querySelector('[data-gutter]')).toBeDisabled()
    beforeInput(root, { inputType: 'insertText', data: 'x' })
    expect(push).not.toHaveBeenCalled()
  })

  it('selectionchange ← onSelect עם הבחירה במודל', async () => {
    const onSelect = vi.fn()
    const { root } = setup({ onSelect })
    setDomSelection(root, { anchor: { lineId: 4, offset: 8 }, focus: { lineId: 4, offset: 11 } })
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'))
      await new Promise((r) => setTimeout(r, 40))
    })
    expect(onSelect).toHaveBeenCalledWith({ anchor: { lineId: 4, offset: 8 }, focus: { lineId: 4, offset: 11 } })
  })

  it('בקשה מבחוץ (request) מזיזה את הבחירה בדפדפן', () => {
    const { root, props, rerender } = setup()
    rerender(<FlowEditor {...props} request={{ sel: { anchor: { lineId: 2, offset: 4 }, focus: { lineId: 2, offset: 7 } }, n: 1 }} />)
    const s = window.getSelection()
    expect(s.toString()).toBe('בית')
    expect(root.contains(s.anchorNode)).toBe(true)
  })

  describe('בקשה בלי מיקוד (לחיצה על הסריקה)', () => {
    const SEL = { anchor: { lineId: 2, offset: 4 }, focus: { lineId: 2, offset: 7 } }
    let outside
    beforeEach(() => {
      outside = document.createElement('button')
      document.body.appendChild(outside)
      outside.focus()
      window.getSelection().removeAllRanges()
    })
    afterEach(() => outside.remove())

    it('העורך אינו במיקוד — הבחירה בדפדפן לא זזה (Delete נשאר של הסריקה); מוצבת כשהעורך מקבל מיקוד מהמקלדת', () => {
      const { root, props, rerender } = setup()
      rerender(<FlowEditor {...props} request={{ sel: SEL, focus: false, n: 1 }} />)
      expect(document.activeElement).toBe(outside)
      expect(window.getSelection().rangeCount).toBe(0)
      fireEvent.focus(root)
      expect(window.getSelection().toString()).toBe('בית')
    })

    it('מיקוד מלחיצה בתוך העורך — הבחירה שנדחתה יורדת (הסמן במקום הלחיצה)', () => {
      const { root, props, rerender } = setup()
      rerender(<FlowEditor {...props} request={{ sel: SEL, focus: false, n: 1 }} />)
      fireEvent.pointerDown(root)
      fireEvent.focus(root)
      expect(window.getSelection().rangeCount).toBe(0)
      fireEvent.pointerUp(window)
      // מיקוד מאוחר יותר (מהמקלדת) — כבר אין מה להציב
      fireEvent.focus(root)
      expect(window.getSelection().rangeCount).toBe(0)
    })

    it('העורך במיקוד — הבחירה מוצבת מיד', () => {
      const { root, props, rerender } = setup()
      root.tabIndex = 0
      root.focus()
      expect(document.activeElement).toBe(root)
      rerender(<FlowEditor {...props} request={{ sel: SEL, focus: false, n: 1 }} />)
      expect(window.getSelection().toString()).toBe('בית')
    })
  })

  it('עזיבת-עכבר מדווחת מכל מילה — גם בלי הצעות (שם אין פתיחה)', () => {
    const onWordEnter = vi.fn()
    const onWordLeave = vi.fn()
    const { root } = setup({ onWordEnter, onWordLeave })
    const w = root.querySelector('[data-line="2"] [data-w="0"]')
    fireEvent.mouseEnter(w)
    fireEvent.mouseLeave(w)
    expect(onWordEnter).not.toHaveBeenCalled()
    expect(onWordLeave).toHaveBeenCalledWith(2, 0)
  })

  it('שורה שהתרוקנה: כפתור "לא-שורה" ← status removed, עם רמז; לא בתצוגה-בלבד ולא בשורה נעולה', () => {
    const emptied = [{ kind: 'text', page: P, ids: [3], value: '' }]
    const { root, push, props } = setup({ ops: emptied })
    const btn = root.querySelector('[data-line="3"] + [data-notline]')
    expect(btn).toHaveAccessibleName(/סימון כלא-שורה/)
    expect(btn.textContent).toBe('')
    fireEvent.click(btn)
    expect(push).toHaveBeenCalledWith({ kind: 'status', page: P, ids: [3], value: 'removed' })
    expect(props.onHint).toHaveBeenCalledWith(expect.stringContaining('לא-שורה'))
    cleanup()
    expect(setup({ ops: emptied, readOnly: true }).root.querySelector('[data-notline]')).toBeNull()
    cleanup()
    const locked = setup({ ops: [...emptied, { kind: 'bbox', page: P, ids: [3], value: [100, 150, 900, 190] }] })
    expect(locked.root.querySelector('[data-notline]')).toBeNull()
  })

  it('הדגשה: b ו-heavy מודגשים; דיבור-המתחיל מודגש אוטומטית בגוון אחר ועם הסבר', () => {
    const { root } = setup({
      ops: [
        { kind: 'para', page: P, ids: [2], value: 'dh' },
        { kind: 'styles', page: P, ids: [3], value: { style: 'heavy', words: [0, 0], on: true } },
      ],
    })
    const auto = root.querySelector('[data-line="2"] [data-w="0"]')
    expect(auto).toHaveAttribute('data-auto-bold', '1')
    expect(auto).toHaveClass('font-bold', 'text-on-surface/60')
    expect(auto).toHaveAttribute('title', expect.stringContaining('מודגש אוטומטית (דיבור המתחיל)'))
    expect(root.querySelector('[data-line="2"] [data-w="1"]')).not.toHaveClass('font-bold')
    const heavy = root.querySelector('[data-line="3"] [data-w="0"]')
    expect(heavy).toHaveClass('font-bold')
    expect(heavy).not.toHaveClass('text-on-surface/60')
    expect(heavy).not.toHaveAttribute('data-auto-bold')
  })

  it('קו אדום = לא בטוח *ובלי הצעות* (כמו במקרא): לא על מילה עם חלופות ולא על מילה עם רקע של מודל-השפה', () => {
    const doc = base()
    doc.lines[1] = {
      ...doc.lines[1],
      flags: { low_words: [0, 1, 2] },
      lm_flags: [{ i: 1, word: 'בית', kinds: ['lm'], lm: [{ text: 'ביית', gain: 1 }] }],
      alternatives: [{ i: 2, word: 'גימל', p: 0.4, alts: [{ text: 'גמל', p: 0.6 }] }],
    }
    render(<FlowEditor view={buildView(doc)} tabKey="main" push={vi.fn()} />)
    const w = (i) => screen.getByRole('textbox').querySelector(`[data-line="2"] [data-w="${i}"]`)
    expect(w(0)).toHaveClass('decoration-dashed', 'decoration-danger-500')
    expect(w(1)).toHaveClass('bg-feature-100')
    expect(w(1)).not.toHaveClass('decoration-dashed')
    expect(w(2)).toHaveClass('decoration-dotted', 'decoration-info-600')
    expect(w(2)).not.toHaveClass('decoration-dashed')
  })

  it('יישור לשני הצדדים (תצוגה בלבד): גוף, ציטוט, סעיף והגהה; לא כותרות, לא שירה ותוכן-עניינים, לא ריהוט', () => {
    const { root, rerender, props } = setup({
      ops: [
        { kind: 'para', page: P, ids: [3], value: 'quote' },
        { kind: 'para', page: P, ids: [4], value: 'gloss' },
      ],
    })
    const para = (key) => root.querySelector(`[data-para="${key}"]`)
    // הכותרת (main_heading) — בלי יישור; הגוף — מיושר, והשורה האחרונה בצד ההתחלה
    expect(para('1:0')).not.toHaveClass('text-justify')
    expect(para('2:0')).toHaveClass('text-justify', '[text-align-last:start]')
    expect(para('3:0')).toHaveClass('text-justify', 'ms-10')
    // הגהה (הפסקה שמתחילה באמצע שורה 4) — מיושרת ובאות קטנה מעט
    expect(para('4:2')).toHaveClass('text-justify', 'text-[0.92em]')
    // שירה ושורת תוכן-עניינים — שורות קצרות: בלי יישור; סעיף ממוספר — מיושר כמו גוף
    const styled = buildView(base(), [
      { kind: 'para', page: P, ids: [2], value: 'poem' },
      { kind: 'para', page: P, ids: [3], value: 'toc' },
      { kind: 'para', page: P, ids: [4], value: 'list' },
    ])
    rerender(<FlowEditor {...props} view={styled} approval={paragraphApproval(styled, 'main')} />)
    expect(para('2:0')).not.toHaveClass('text-justify')
    expect(para('3:0')).not.toHaveClass('text-justify')
    expect(para('4:2')).toHaveClass('text-justify')
    // ריהוט הדף — שורות בודדות, בלי יישור
    rerender(<FlowEditor {...props} view={styled} tabKey={FURNITURE_TAB} approval={null} />)
    expect(root.querySelector('[data-para]')).not.toHaveClass('text-justify')
    // ה-DOM עצמו לא השתנה: הקטעים והמילים כמו קודם (המיפוי DOM↔מודל — flowDom)
    rerender(<FlowEditor {...props} view={styled} />)
    expect(root.querySelector('[data-line="2"] [data-w="2"]').textContent).toBe('גימל')
  })

  it('מעבר שני: פסקה שאושרה בסבב הקודם — ✓ ירוק ונעול (אין מה לבטל)', () => {
    const view = buildView(base())
    const approval = paragraphApproval({ ...view, _preOk: new Set([2]) }, 'main')
    const onUnapprove = vi.fn()
    render(<FlowEditor view={view} tabKey="main" push={vi.fn()} approval={approval} onUnapprove={onUnapprove} />)
    const root = screen.getByRole('textbox')
    const p = root.querySelector('[data-para="2:0"]')
    expect(p).toHaveAttribute('data-approved', '1')
    expect(p).toHaveAttribute('data-preapproved', '1')
    const gutter = p.querySelector('[data-gutter]')
    expect(gutter).toBeDisabled()
    expect(gutter).toHaveAccessibleName('הפסקה אושרה כבר בסבב הקודם')
    fireEvent.click(gutter)
    expect(onUnapprove).not.toHaveBeenCalled()
  })
})
