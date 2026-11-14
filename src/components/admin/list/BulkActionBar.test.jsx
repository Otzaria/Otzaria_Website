import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import BulkActionBar from './BulkActionBar'

describe('BulkActionBar', () => {
  test('בלי בחירה: התוכן השקט, ואזור ההכרזה קיים וריק', () => {
    render(<BulkActionBar count={0} countText="" idle={<p>288 ספרים</p>} actions={<button type="button">מחק</button>} onClear={vi.fn()} />)
    expect(screen.getByText('288 ספרים')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'מחק' })).not.toBeInTheDocument()
  })

  test('עם בחירה: מכריז על המספר, מציג פעולות ו"נקה בחירה"', () => {
    const onClear = vi.fn()
    render(<BulkActionBar count={3} countText="3 העלאות נבחרו" idle={<p>288 ספרים</p>} actions={<button type="button">מחק</button>} onClear={onClear} />)
    expect(screen.getByRole('status')).toHaveTextContent('3 העלאות נבחרו')
    expect(screen.getByRole('group', { name: 'פעולות על הנבחרים' })).toBeInTheDocument()
    expect(screen.queryByText('288 ספרים')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'נקה בחירה' }))
    expect(onClear).toHaveBeenCalled()
  })

  test('דביקה רק כשיש בחירה; ביטול בחירה מוכרז', () => {
    const { container, rerender } = render(<BulkActionBar count={0} countText="" clearedText="" idle={<p>288 ספרים</p>} onClear={vi.fn()} />)
    expect(container.firstChild.className).not.toMatch(/sticky/)
    rerender(<BulkActionBar count={2} countText="2 ספרים נבחרו" idle={null} onClear={vi.fn()} />)
    expect(container.firstChild.className).toMatch(/sticky/)
    rerender(<BulkActionBar count={0} countText="" clearedText="הבחירה בוטלה" idle={null} onClear={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('הבחירה בוטלה')
  })
})
