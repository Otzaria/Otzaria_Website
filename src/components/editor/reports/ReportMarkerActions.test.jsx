import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, renderHook } from '@testing-library/react'
import ReportMarkerActions from './ReportMarkerActions'
import { useReportMarkerActions } from './useReportMarkerActions'

const MARK = '(שלמם)[שלום]'
const hit = { column: 'content', start: 4, end: 16, original: 'שלמם', proposed: 'שלום', markerText: MARK, count: 1 }
const report = (extra = {}) => ({ status: 'approved', original: 'שלמם', proposed: 'שלום', finalOriginal: null, finalProposed: null, ...extra })

describe('ReportMarkerActions', () => {
  it('אושר — "החלף בתיקון"; בנוסח מנהל — גם "השאר בסוגריים"', () => {
    const onRun = vi.fn()
    const { rerender } = render(<ReportMarkerActions state={{ phase: 'found', report: report(), hit }} onRun={onRun} />)
    fireEvent.click(screen.getByRole('button', { name: 'החלף בתיקון' }))
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'replace', replacement: 'שלום' }))
    expect(screen.queryByRole('button', { name: /השאר בסוגריים/ })).toBeNull()
    rerender(<ReportMarkerActions state={{ phase: 'found', report: report({ finalProposed: 'שלומם' }), hit }} onRun={onRun} />)
    expect(screen.getByRole('button', { name: 'השאר בסוגריים בנוסח שהוחלט' })).toBeInTheDocument()
  })

  it('נדחה — "החזר את המקור"; ממתין / לא נמצא — כלום', () => {
    const { rerender, container } = render(<ReportMarkerActions state={{ phase: 'found', report: report({ status: 'rejected' }), hit }} onRun={() => {}} />)
    expect(screen.getByRole('button', { name: 'החזר את המקור' })).toBeInTheDocument()
    rerender(<ReportMarkerActions state={{ phase: 'found', report: report({ status: 'pending' }), hit }} onRun={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ReportMarkerActions state={{ phase: 'missing', report: report() }} onRun={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('useReportMarkerActions', () => {
  const setup = (value, rep = report()) => {
    const el = document.createElement('textarea')
    el.value = value
    document.body.appendChild(el)
    const focus = {
      state: { phase: 'found', report: rep, hit },
      locate: vi.fn(() => (el.value.slice(4, 16) === MARK ? { el, hit } : null)),
      markDone: vi.fn(),
      rehighlight: vi.fn(),
    }
    const applyColumnText = vi.fn()
    const { result } = renderHook(() => useReportMarkerActions({ focus, applyColumnText }))
    return { run: result.current, focus, applyColumnText }
  }

  it('מחיל דרך העורך (בלי execCommand — דרך applyColumnText) ומסמן "בוצע"', () => {
    document.execCommand = vi.fn(() => false)
    const { run, focus, applyColumnText } = setup(`אמר ${MARK} עליכם`)
    expect(run({ id: 'replace' })).toBe(true)
    expect(applyColumnText).toHaveBeenCalledWith('content', 'אמר שלום עליכם')
    expect(focus.markDone).toHaveBeenCalledWith('הסימון הוחלף בתיקון.')
  })

  it('נדחה — מחזיר את המקור', () => {
    document.execCommand = vi.fn(() => false)
    const { run, applyColumnText } = setup(`אמר ${MARK} עליכם`, report({ status: 'rejected' }))
    expect(run({ id: 'restore' })).toBe(true)
    expect(applyColumnText).toHaveBeenCalledWith('content', 'אמר שלמם עליכם')
  })

  it('הסימון כבר לא בטקסט — לא נוגעים, ומחפשים מחדש', () => {
    const { run, focus, applyColumnText } = setup('אמר שלום עליכם')
    expect(run({ id: 'replace' })).toBe(false)
    expect(applyColumnText).not.toHaveBeenCalled()
    expect(focus.rehighlight).toHaveBeenCalled()
  })

  it('פעולה שלא מתאימה להכרעה — לא נוגעים', () => {
    const { run, applyColumnText } = setup(`אמר ${MARK} עליכם`)
    expect(run({ id: 'restore' })).toBe(false)
    expect(applyColumnText).not.toHaveBeenCalled()
  })
})
