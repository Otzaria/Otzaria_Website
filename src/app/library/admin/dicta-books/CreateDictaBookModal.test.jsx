import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateDictaBookModal from './CreateDictaBookModal'

describe('CreateDictaBookModal', () => {
  it('מציג את הערכים הנוכחיים ומעביר שינויים להורה', async () => {
    const onTitleChange = vi.fn()
    render(
      <CreateDictaBookModal
        title="שם קיים"
        content="תוכן קיים"
        onTitleChange={onTitleChange}
        onContentChange={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('שם קיים')).toBeInTheDocument()
    expect(screen.getByDisplayValue('תוכן קיים')).toBeInTheDocument()

    await userEvent.setup().type(screen.getByDisplayValue('שם קיים'), '!')
    expect(onTitleChange).toHaveBeenCalled()
  })

  it('קורא ל-onCreate בלחיצה על "צור ספר" ול-onClose בלחיצה על "ביטול" או סגירה', async () => {
    const onCreate = vi.fn()
    const onClose = vi.fn()
    render(
      <CreateDictaBookModal
        title=""
        content=""
        onTitleChange={vi.fn()}
        onContentChange={vi.fn()}
        onClose={onClose}
        onCreate={onCreate}
      />
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'צור ספר' }))
    expect(onCreate).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
