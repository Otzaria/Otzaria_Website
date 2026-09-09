import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DictaDeleteDialog from './DictaDeleteDialog'

describe('DictaDeleteDialog', () => {
  it('renders the book title', () => {
    render(<DictaDeleteDialog bookTitle="ספר ויקרא" onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} />)
    expect(screen.getByText('ספר ויקרא')).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    render(<DictaDeleteDialog bookTitle="ספר" onConfirm={onConfirm} onCancel={vi.fn()} loading={false} />)
    await userEvent.click(screen.getByText('כן, מחק את העותק'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when clicking the backdrop, the cancel button, or Escape', async () => {
    const onCancel = vi.fn()
    const { container } = render(<DictaDeleteDialog bookTitle="ספר" onConfirm={vi.fn()} onCancel={onCancel} loading={false} />)
    await userEvent.click(screen.getByText('ביטול'))
    expect(onCancel).toHaveBeenCalledTimes(1)

    await userEvent.click(container.firstChild)
    expect(onCancel).toHaveBeenCalledTimes(2)

    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('disables the buttons and shows a loading label while loading', () => {
    render(<DictaDeleteDialog bookTitle="ספר" onConfirm={vi.fn()} onCancel={vi.fn()} loading={true} />)
    expect(screen.getByText('מוחק...')).toBeInTheDocument()
    expect(screen.getByText('מוחק...').closest('button')).toBeDisabled()
    expect(screen.getByText('ביטול').closest('button')).toBeDisabled()
  })
})
