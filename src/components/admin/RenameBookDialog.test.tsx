import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RenameBookDialog from './RenameBookDialog'

const categories = [
  { name: 'כללי', color: '#64748b' },
  { name: 'הלכה', color: '#123456' },
]

describe('RenameBookDialog', () => {
  it('initializes the fields from the book and disables save until something changes', async () => {
    const onSave = vi.fn()
    render(
      <RenameBookDialog
        book={{ id: '1', name: 'ספר א', category: 'כללי' }}
        categories={categories}
        onClose={vi.fn()}
        onSave={onSave}
      />
    )

    const nameInput = screen.getByDisplayValue('ספר א')
    expect(screen.getByRole('button', { name: 'שמור שינויים' })).toBeDisabled()

    const user = userEvent.setup()
    await user.clear(nameInput)
    await user.type(nameInput, 'שם חדש')

    expect(screen.getByRole('button', { name: 'שמור שינויים' })).not.toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    expect(onSave).toHaveBeenCalledWith('שם חדש', 'כללי')
  })

  it('disables save when the name is emptied even if the category changed', async () => {
    render(
      <RenameBookDialog
        book={{ id: '1', name: 'ספר א', category: 'כללי' }}
        categories={categories}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    )
    const user = userEvent.setup()
    await user.clear(screen.getByDisplayValue('ספר א'))
    expect(screen.getByRole('button', { name: 'שמור שינויים' })).toBeDisabled()
  })

  it('locks the category select and shows the personal-book notice for private/owned books', () => {
    render(
      <RenameBookDialog
        book={{ id: '2', name: 'ספר אישי', category: 'כללי', isPrivate: true }}
        categories={categories}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    )
    expect(screen.getByText('ספר אישי - לא ניתן לשינוי')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn()
    render(
      <RenameBookDialog
        book={{ id: '1', name: 'ספר א', category: 'כללי' }}
        categories={categories}
        onClose={onClose}
        onSave={vi.fn()}
      />
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
