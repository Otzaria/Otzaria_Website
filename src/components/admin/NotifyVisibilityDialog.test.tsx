import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotifyVisibilityDialog from './NotifyVisibilityDialog'

describe('NotifyVisibilityDialog', () => {
  it('shows the book name and calls onConfirm(true) for the send-email option', async () => {
    const onConfirm = vi.fn()
    render(
      <NotifyVisibilityDialog
        book={{ name: 'ספר לדוגמה' }}
        isUpdatingStatus={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/ספר לדוגמה/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /כן, חשוף ושלח מייל/ }))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('calls onConfirm(false) for the no-email option', async () => {
    const onConfirm = vi.fn()
    render(
      <NotifyVisibilityDialog
        book={{ name: 'ספר לדוגמה' }}
        isUpdatingStatus={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'לא, רק חשוף (ללא מייל)' }))
    expect(onConfirm).toHaveBeenCalledWith(false)
  })

  it('disables both action buttons while updating', () => {
    render(
      <NotifyVisibilityDialog
        book={{ name: 'ספר לדוגמה' }}
        isUpdatingStatus={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('מעדכן ושולח...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'לא, רק חשוף (ללא מייל)' })).toBeDisabled()
  })

  it('calls onClose from the header close button', async () => {
    const onClose = vi.fn()
    render(
      <NotifyVisibilityDialog
        book={{ name: 'ספר לדוגמה' }}
        isUpdatingStatus={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />
    )
    await userEvent.setup().click(screen.getByText('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
