import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReminderUserSelectionModal from './ReminderUserSelectionModal'

const users = [
  { email: 'a@example.com', name: 'אלכס' },
  { email: 'b@example.com', name: 'בני', books: [{ title: 'ספר א', daysSinceClaim: 10 }] },
]

describe('ReminderUserSelectionModal', () => {
  it('מציג את רשימת המשתמשים ואת ספירת הנבחרים', () => {
    render(
      <ReminderUserSelectionModal
        users={users}
        selected={['a@example.com']}
        bookType="regular"
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('אלכס')).toBeInTheDocument()
    expect(screen.getByText('בני')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'אישור (1)' })).toBeInTheDocument()
  })

  it('מציג רשימת ספרים לכל משתמש רק כש-bookType הוא dicta', () => {
    const { rerender } = render(
      <ReminderUserSelectionModal
        users={users}
        selected={[]}
        bookType="regular"
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByText('ספר א (10 ימים)')).not.toBeInTheDocument()

    rerender(
      <ReminderUserSelectionModal
        users={users}
        selected={[]}
        bookType="dicta"
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('ספר א (10 ימים)')).toBeInTheDocument()
  })

  it('קורא ל-onToggle עם האימייל הנכון', async () => {
    const onToggle = vi.fn()
    render(
      <ReminderUserSelectionModal
        users={users}
        selected={[]}
        bookType="regular"
        onToggle={onToggle}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.setup().click(checkboxes[0])
    expect(onToggle).toHaveBeenCalledWith('a@example.com')
  })

  it('קורא ל-onSelectAll/onSelectNone/onClose בהתאם', async () => {
    const onSelectAll = vi.fn()
    const onSelectNone = vi.fn()
    const onClose = vi.fn()
    render(
      <ReminderUserSelectionModal
        users={users}
        selected={[]}
        bookType="regular"
        onToggle={vi.fn()}
        onSelectAll={onSelectAll}
        onSelectNone={onSelectNone}
        onClose={onClose}
      />
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'בחר הכל' }))
    expect(onSelectAll).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'נקה הכל' }))
    expect(onSelectNone).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: /אישור/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
