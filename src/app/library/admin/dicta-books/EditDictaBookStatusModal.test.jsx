import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditDictaBookStatusModal from './EditDictaBookStatusModal'

describe('EditDictaBookStatusModal', () => {
  it('מציג את שם הספר ואת הסטטוס הנוכחי', () => {
    render(
      <EditDictaBookStatusModal
        book={{ title: 'ספר לדוגמה' }}
        status="in-progress"
        onStatusChange={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    )
    expect(screen.getByText('ספר לדוגמה')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('in-progress')
  })

  it('מעביר שינוי סטטוס להורה', async () => {
    const onStatusChange = vi.fn()
    render(
      <EditDictaBookStatusModal
        book={{ title: 'ספר' }}
        status="available"
        onStatusChange={onStatusChange}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    )
    await userEvent.setup().selectOptions(screen.getByRole('combobox'), 'completed')
    expect(onStatusChange).toHaveBeenCalledWith('completed')
  })

  it('קורא ל-onSave ול-onClose בהתאם ללחיצה', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(
      <EditDictaBookStatusModal
        book={{ title: 'ספר' }}
        status="available"
        onStatusChange={vi.fn()}
        onClose={onClose}
        onSave={onSave}
      />
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
