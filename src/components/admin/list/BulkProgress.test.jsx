// שורת ההתקדמות של פעולה מרובה: בלי announce — הטקסט עצמו מוכרז (כמו קודם, בכל המסכים); עם announce — רק הוא
// מוכרז, והטקסט הגלוי מוסתר מקורא המסך; stopping — "עוצר…" ו"עצור" לא פעיל.
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BulkProgress from './BulkProgress'

describe('BulkProgress', () => {
  test('בלי announce — הטקסט הוא אזור ההכרזה', () => {
    render(<BulkProgress text="משחרר… 3 מתוך 10" value={3} max={10} onStop={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('משחרר… 3 מתוך 10')
  })

  test('עם announce — מוכרז רק הוא; הטקסט הגלוי מתעדכן בלי הכרזה', () => {
    const { rerender } = render(<BulkProgress text="משחרר… 3 מתוך 2,000" announce="משחרר… 0 מתוך 2,000" value={3} max={2000} onStop={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('משחרר… 0 מתוך 2,000')
    expect(screen.getByText('משחרר… 3 מתוך 2,000')).toHaveAttribute('aria-hidden', 'true')
    rerender(<BulkProgress text="משחרר… 4 מתוך 2,000" announce="משחרר… 0 מתוך 2,000" value={4} max={2000} onStop={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('משחרר… 0 מתוך 2,000')
  })

  test('stopping — "עוצר…" (גם בהכרזה), ו"עצור" לא מגיב', async () => {
    const onStop = vi.fn()
    render(<BulkProgress text="משחרר… 3 מתוך 10" announce="משחרר… 0 מתוך 10" value={3} max={10} onStop={onStop} stopping />)
    expect(screen.getByRole('status')).toHaveTextContent('עוצר…')
    const stop = screen.getByRole('button', { name: 'עצור' })
    expect(stop).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(stop)
    expect(onStop).not.toHaveBeenCalled()
  })
})
