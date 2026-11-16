import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReportFocusBar from './ReportFocusBar'

const report = { original: 'שלמם', proposed: 'שלום' }

describe('ReportFocusBar', () => {
  it('בלי מצב — לא מוצג', () => {
    const { container } = render(<ReportFocusBar state={null} onRehighlight={() => {}} onDismiss={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('נמצא: ההודעה, הסימון, "סמן שוב" וסגירה', () => {
    const onRehighlight = vi.fn()
    const onDismiss = vi.fn()
    render(<ReportFocusBar state={{ phase: 'found', report, count: 1 }} onRehighlight={onRehighlight} onDismiss={onDismiss} />)
    expect(screen.getByRole('status')).toHaveTextContent('הסימון של הדיווח מסומן בטקסט.')
    expect(screen.getByRole('status')).toHaveTextContent('(שלמם)[שלום]')
    fireEvent.click(screen.getByRole('button', { name: 'סמן שוב' }))
    fireEvent.click(screen.getByRole('button', { name: 'סגור' }))
    expect(onRehighlight).toHaveBeenCalledOnce()
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('לא נמצא — הודעת אזהרה; שגיאה — בלי "סמן שוב"', () => {
    const { rerender } = render(<ReportFocusBar state={{ phase: 'missing', report }} onRehighlight={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('לא נמצא')
    rerender(<ReportFocusBar state={{ phase: 'error', report: null, error: 'אין הרשאה' }} onRehighlight={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('אין הרשאה')
    expect(screen.queryByRole('button', { name: 'סמן שוב' })).toBeNull()
  })
})

describe('ReportFocusBar — הכרעה', () => {
  it('מציג מה הוחלט', () => {
    render(<ReportFocusBar state={{ phase: 'found', report: { ...report, status: 'rejected' }, count: 1 }} onRehighlight={() => {}} onDismiss={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('נדחה. הטקסט שבספר נשאר כמו שהוא.')
  })
})
