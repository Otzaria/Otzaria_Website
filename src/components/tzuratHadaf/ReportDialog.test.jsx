import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ReportDialog from './ReportDialog'

const scan = { url: '/api/tzurat-hadaf/pages/x/image?side=scan', w: 1000, h: 1000 }
const ours = { url: '/api/tzurat-hadaf/pages/x/image?side=ours', w: 1000, h: 1000 }

function open(props = {}) {
  const onSave = vi.fn()
  render(<ReportDialog scan={scan} ours={ours} onSave={onSave} onClose={() => {}} {...props} />)
  return { onSave }
}

describe('ReportDialog', () => {
  it('בלי סוג — שגיאה; "אחר" בלי תיאור — שגיאה', () => {
    const { onSave } = open()
    fireEvent.click(screen.getByRole('button', { name: /שמירת הדיווח/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/בחרו את סוג הבעיה/)
    fireEvent.change(screen.getByLabelText('סוג הבעיה'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: /שמירת הדיווח/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/"אחר"/)
    expect(screen.getByLabelText(/תיאור \(חובה\)/)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('סוג ותיאור — נשמר', () => {
    const { onSave } = open({ initial: { category: 'header' } })
    expect(screen.getByLabelText('סוג הבעיה')).toHaveValue('header')
    fireEvent.change(screen.getByLabelText(/תיאור/), { target: { value: ' הכותרת נמוכה ' } })
    fireEvent.click(screen.getByRole('button', { name: /שמירת הדיווח/ }))
    expect(onSave).toHaveBeenCalledWith({ category: 'header', text: 'הכותרת נמוכה', regions: [] })
  })

  it('ציור מלבן על הסריקה נכנס ל-regions', () => {
    const { onSave } = open({ initial: { category: 'missing' } })
    const [svg] = screen.getAllByTestId('draw-svg')
    // בסביבת הבדיקה אין מידות מסך: נקודת לקוח = פיקסל תמונה
    fireEvent.pointerDown(svg, { clientX: 100, clientY: 200, button: 0, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 250, pointerId: 1 })
    fireEvent.pointerUp(svg, { clientX: 300, clientY: 250, pointerId: 1 })
    expect(screen.getByRole('img', { name: /הסריקה: מסומן מלבן/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /שמירת הדיווח/ }))
    expect(onSave).toHaveBeenCalledWith({ category: 'missing', text: '', regions: [{ side: 'scan', x: 0.1, y: 0.2, w: 0.2, h: 0.05 }] })
  })

  it('עריכת דיווח קיים — המלבן והתיאור נטענים, ואפשר לנקות', () => {
    const { onSave } = open({ initial: { category: 'size', text: 'גדול', regions: [{ side: 'ours', x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] } })
    expect(screen.getByText('עריכת דיווח')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /העמוד שלנו: מסומן מלבן/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ניקוי הסימון/ }))
    fireEvent.click(screen.getByRole('button', { name: /שמירת הדיווח/ }))
    expect(onSave).toHaveBeenCalledWith({ category: 'size', text: 'גדול', regions: [] })
  })
})
