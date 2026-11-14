import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import RestReminder from './RestReminder'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('RestReminder', () => {
  it('לא חוסם: אזור עם שם, הודעת status, ולא לוקח פוקוס', () => {
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    input.focus()
    render(<RestReminder onSnooze={() => {}} onDone={() => {}} />)
    expect(screen.getByRole('region', { name: 'תזכורת מנוחה' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('עברו 20 דקות. הסתכל 20 שניות על משהו רחוק.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(input).toHaveFocus()
    input.remove()
  })

  it('"אחר כך" קורא ל-onSnooze', () => {
    const onSnooze = vi.fn()
    render(<RestReminder onSnooze={onSnooze} onDone={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'אחר כך' }))
    expect(onSnooze).toHaveBeenCalled()
  })

  it('"התחל 20 שניות" — ספירה לאחור, ובסוף onDone', () => {
    const onDone = vi.fn()
    render(<RestReminder onSnooze={() => {}} onDone={onDone} />)
    const start = screen.getByRole('button', { name: 'התחל 20 שניות' })
    start.focus()
    fireEvent.click(start)
    expect(screen.getByRole('status')).toHaveTextContent('הסתכל על משהו רחוק.')
    expect(screen.getByRole('button', { name: 'דלג' })).toHaveFocus()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByText('15')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(15000) })
    expect(screen.getByRole('status')).toHaveTextContent('יפה. אפשר לחזור לעבודה.')
    expect(onDone).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2500) })
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
