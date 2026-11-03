import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OcrRow from './OcrRow'

// שורה בסקירת זיהוי-הטקסט: הבדלים ברמת-מילה בין המודל למתנדב, "תקן ואשר" עם עריכה
// במקום (Enter מאשר עם התיקון, Esc מבטל), וההחזרה לממתינות של שורה שאושרה.

const item = (extra = {}) => ({
  id: 'a1',
  section: 'ocr',
  status: 'submitted',
  img: '/x.png',
  w: 600,
  h: 40,
  alias: 'ספר 412',
  page: 17,
  track: 'rashi',
  source: 'ocr',
  text: 'אמר רבי יצחק לא',
  conf: 72,
  result: { action: 'fixed', text: 'אמר רב יצחק לא היה' },
  vol: { id: 'v', name: 'רחל' },
  submittedAt: new Date().toISOString(),
  ctx: null,
  ...extra,
})

const handlers = () => ({ onToggle: vi.fn(), onApprove: vi.fn(), onReject: vi.fn(), onFix: vi.fn(), onMark: vi.fn(), onUnapprove: vi.fn() })

describe('OcrRow', () => {
  it('ההבדלים ברמת מילה: מה שנמחק ומה שנוסף מסומנים', () => {
    const { container } = render(<OcrRow item={item()} selected={false} {...handlers()} />)
    expect([...container.querySelectorAll('del')].map((e) => e.textContent)).toEqual(['רבי'])
    expect([...container.querySelectorAll('ins')].map((e) => e.textContent)).toEqual(['רב', 'היה'])
    expect(screen.getByText('תיקן')).toBeInTheDocument()
    expect(screen.getByText(/ביטחון 72/)).toBeInTheDocument()
  })

  it('"תקן ואשר": העריכה נפתחת עם הטקסט של המתנדב; Enter שולח את התיקון', () => {
    const h = handlers()
    render(<OcrRow item={item()} selected={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: /תקן ואשר/ }))
    const input = screen.getByLabelText('התיקון שלך:')
    expect(input).toHaveValue('אמר רב יצחק לא היה')
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'אמר רבי יצחק לא היה ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(h.onFix).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), 'אמר רבי יצחק לא היה')
  })

  it('Esc מבטל את העריכה בלי לשלוח; "נכון" — העריכה מתחילה מטקסט המודל', () => {
    const h = handlers()
    render(<OcrRow item={item({ result: { action: 'ok' } })} selected={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: /תקן ואשר/ }))
    const input = screen.getByLabelText('התיקון שלך:')
    expect(input).toHaveValue('אמר רבי יצחק לא')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByLabelText('התיקון שלך:')).toBeNull()
    expect(h.onFix).not.toHaveBeenCalled()
  })

  it('אשר · דחה · סימון; שורה שאושרה — "החזר לממתינות"', () => {
    const h = handlers()
    const { rerender } = render(<OcrRow item={item()} selected={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: /^check אשר$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'דחה' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'סמן שורה' }))
    expect(h.onApprove).toHaveBeenCalledTimes(1)
    expect(h.onReject).toHaveBeenCalledTimes(1)
    expect(h.onToggle).toHaveBeenCalledWith('a1')
    rerender(<OcrRow item={item({ status: 'approved', adminFixed: true, volResult: { action: 'ok' } })} selected={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: /החזר לממתינות/ }))
    expect(h.onUnapprove).toHaveBeenCalled()
    expect(screen.getByText('תיקנת')).toBeInTheDocument()
  })

  it('"לא קריא" / "לנתב": המנהל קובע במקום המתנדב; מה שהמתנדב כבר סימן — אין כפתור', () => {
    const h = handlers()
    const { rerender } = render(<OcrRow item={item()} selected={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: /לא קריא/ }))
    fireEvent.click(screen.getByRole('button', { name: /לנתב/ }))
    expect(h.onMark.mock.calls.map((c) => c[1])).toEqual(['bad', 'router'])
    rerender(<OcrRow item={item({ result: { action: 'bad' } })} selected={false} {...h} />)
    expect(screen.queryByRole('button', { name: /לא קריא/ })).toBeNull()
    expect(screen.getByRole('button', { name: /לנתב/ })).toBeInTheDocument()
    rerender(<OcrRow item={item({ status: 'approved' })} selected={false} {...h} />)
    expect(screen.queryByRole('button', { name: /לנתב/ })).toBeNull()
  })
})
