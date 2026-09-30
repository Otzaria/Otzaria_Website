import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBar, { opsLabel, approvalLabel } from './StatusBar'

describe('StatusBar — שורת-המצב', () => {
  it('ניסוח מספר השינויים', () => {
    expect(opsLabel(0)).toBe('אין שינויים')
    expect(opsLabel(1)).toBe('שינוי אחד')
    expect(opsLabel(7)).toBe('7 שינויים')
    expect(opsLabel(undefined)).toBe('אין שינויים')
  })

  it('ניסוח אישור הפסקאות', () => {
    expect(approvalLabel({ approved: 5, total: 12 })).toBe('אושרו 5 מתוך 12 פסקאות')
    expect(approvalLabel({ approved: 12, total: 12 })).toBe('כל 12 הפסקאות אושרו')
    expect(approvalLabel({ approved: 1, total: 1 })).toBe('הפסקה אושרה')
    expect(approvalLabel({ approved: 0, total: 0 })).toBeNull()
    expect(approvalLabel(null)).toBeNull()
  })

  it('שורה · זרם · מילה (מ-1) · שינויים · אישור · רמז', () => {
    render(<StatusBar lineNo={12} streamHe="ראשי" wordIndex={3} opsCount={7} approval={{ approved: 5, total: 12 }} hint="זה סוף-שורה בסריקה" />)
    expect(screen.getByText('שורה 12')).toBeInTheDocument()
    expect(screen.getByText('ראשי')).toBeInTheDocument()
    expect(screen.getByText('מילה 4')).toBeInTheDocument()
    expect(screen.getByText('7 שינויים')).toBeInTheDocument()
    expect(screen.getByText('אושרו 5 מתוך 12 פסקאות')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'פסקאות שאושרו' })).toHaveAttribute('aria-valuenow', '5')
    const hint = screen.getByText('זה סוף-שורה בסריקה')
    expect(hint).toHaveAttribute('aria-live', 'polite')
  })

  it('בלי סמן ובלי פסקאות — רק מספר השינויים', () => {
    render(<StatusBar opsCount={0} wordIndex={-1} />)
    expect(screen.getByText('אין שינויים')).toBeInTheDocument()
    expect(screen.queryByText(/שורה/)).toBeNull()
    expect(screen.queryByText(/מילה/)).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
