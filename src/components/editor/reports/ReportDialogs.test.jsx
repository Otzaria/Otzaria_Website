import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ErrorReportDialog from './ErrorReportDialog'
import PageMessageDialog from './PageMessageDialog'
import MyPageReports from './MyPageReports'

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
})

describe('ErrorReportDialog', () => {
  it('שני השדות ממולאים בבחירה, הפוקוס על התיקון, ותצוגה מקדימה חיה עם הדגשת ההבדל', async () => {
    render(<ErrorReportDialog initialText="יהודה" onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'דיווח על טעות בספר' })).toBeInTheDocument()
    // שני רעיונות — שתי שורות נפרדות, והראשונה מתחילה ב"רק"
    expect(screen.getByText(/^רק לטעות שנמצאת בספר המודפס עצמו/)).not.toHaveTextContent(/טעות זיהוי/)
    expect(screen.getByText(/^טעות זיהוי \(OCR\) מתקנים ישירות בטקסט/)).toBeInTheDocument()
    const original = screen.getByLabelText('הטקסט שבספר')
    const proposed = screen.getByLabelText('התיקון המוצע')
    expect(original).toHaveValue('יהודה')
    expect(proposed).toHaveValue('יהודה')
    await waitFor(() => expect(proposed).toHaveFocus())
    fireEvent.change(proposed, { target: { value: 'יהודא' } })
    const preview = document.querySelector('[aria-live="polite"]')
    expect(preview).toHaveTextContent('(יהודה) [יהודא]')
    expect(preview.querySelector('del')).toHaveTextContent('ה')
    expect(preview.querySelector('ins')).toHaveTextContent('א')
  })

  it('שליחה מעבירה את הערכים; שגיאה מוצגת והחלון נשאר', async () => {
    const onSubmit = vi.fn().mockResolvedValue('התיקון המוצע זהה לטקסט שבספר')
    render(<ErrorReportDialog initialText="אבג" onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('הערה למנהלים (לא חובה)'), { target: { value: 'הערה' } })
    fireEvent.click(screen.getByRole('button', { name: 'שליחת הדיווח' }))
    expect(onSubmit).toHaveBeenCalledWith({ original: 'אבג', proposed: 'אבג', note: 'הערה' })
    expect(await screen.findByRole('alert')).toHaveTextContent('התיקון המוצע זהה לטקסט שבספר')
    expect(screen.getByRole('button', { name: 'שליחת הדיווח' })).not.toBeDisabled()
  })

  it('Ctrl+Enter שולח', () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    render(<ErrorReportDialog initialText="אבג" onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.keyDown(screen.getByLabelText('התיקון המוצע'), { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Enter ולחיצה באותו רגע — שליחה אחת בלבד', () => {
    const onSubmit = vi.fn(() => new Promise(() => {}))
    render(<ErrorReportDialog initialText="אבג" onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.keyDown(screen.getByLabelText('התיקון המוצע'), { key: 'Enter', ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'שליחת הדיווח' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('onSubmit שזורק — השגיאה מוצגת והכפתור משתחרר', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('x'))
    render(<ErrorReportDialog initialText="אבג" onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'שליחת הדיווח' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('שליחת הדיווח נכשלה.')
    expect(screen.getByRole('button', { name: 'שליחת הדיווח' })).not.toBeDisabled()
  })

  it('שם הטור מופיע בכותרת המשנה', () => {
    render(<ErrorReportDialog initialText="" columnLabel="רש״י" onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(/רש״י/)
  })
})

describe('PageMessageDialog', () => {
  it('מונה תווים ושליחה', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    render(<PageMessageDialog pageNumber={4} onSubmit={onSubmit} onClose={vi.fn()} />)
    const field = screen.getByLabelText('ההודעה')
    await waitFor(() => expect(field).toHaveFocus())
    expect(screen.getByText('נשארו 2000 תווים')).toBeInTheDocument()
    fireEvent.change(field, { target: { value: 'צילום חסר' } })
    expect(screen.getByText('נשארו 1991 תווים')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'שליחה' }))
    expect(onSubmit).toHaveBeenCalledWith('צילום חסר')
  })

  it('שגיאה מהשרת מוצגת', async () => {
    const onSubmit = vi.fn().mockResolvedValue('יש לכתוב את תוכן ההודעה')
    render(<PageMessageDialog pageNumber={4} onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'שליחה' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('יש לכתוב את תוכן ההודעה')
  })
})

describe('MyPageReports', () => {
  it('נטען רק בפתיחה, ומציג סטטוס', async () => {
    const load = vi.fn().mockResolvedValue([
      { _id: '1', kind: 'book_error', original: 'יהודה', proposed: 'יהודא', finalOriginal: 'יהודה', finalProposed: 'יהודאי', status: 'approved', createdAt: new Date().toISOString(), resolution: { note: 'תודה' } },
      { _id: '2', kind: 'message', message: 'צילום חסר', status: 'pending', createdAt: new Date().toISOString() },
    ])
    const { container } = render(<MyPageReports bookPath="ספר" pageNumber={2} load={load} />)
    expect(load).not.toHaveBeenCalled()
    const details = container.querySelector('details')
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(await screen.findByText(/יהודה ← יהודא$/)).toBeInTheDocument()
    expect(load).toHaveBeenCalledWith('ספר', 2)
    expect(screen.getByText('אושר')).toBeInTheDocument()
    expect(screen.getByText('ממתין')).toBeInTheDocument()
    expect(screen.getByText('תשובת המנהל: תודה')).toBeInTheDocument()
    expect(screen.getByText(/יהודה ← יהודאי/)).toHaveTextContent('הוחלט:')
  })
})
