import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DictaResetDialog from './DictaResetDialog'

describe('DictaResetDialog', () => {
  it('renders the book title and the github-origin warning by default', () => {
    render(
      <DictaResetDialog bookTitle="ספר בראשית" onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} isEditCopy={false} />
    )
    expect(screen.getByText('ספר בראשית')).toBeInTheDocument()
    expect(screen.getByText('• הספר יחזור למצבו המקורי מגיטהאב')).toBeInTheDocument()
  })

  it('shows the uploads-origin warning for edit copies', () => {
    render(
      <DictaResetDialog bookTitle="ספר שמות" onConfirm={vi.fn()} onCancel={vi.fn()} loading={false} isEditCopy={true} />
    )
    expect(screen.getByText('• הספר יחזור למצבו המקורי מההעלאות')).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    render(
      <DictaResetDialog bookTitle="ספר" onConfirm={onConfirm} onCancel={vi.fn()} loading={false} isEditCopy={false} />
    )
    await userEvent.click(screen.getByText('כן, אפס את הספר'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when clicking the backdrop, the cancel button, or Escape', async () => {
    const onCancel = vi.fn()
    const { container } = render(
      <DictaResetDialog bookTitle="ספר" onConfirm={vi.fn()} onCancel={onCancel} loading={false} isEditCopy={false} />
    )
    await userEvent.click(screen.getByText('ביטול'))
    expect(onCancel).toHaveBeenCalledTimes(1)

    await userEvent.click(container.firstChild)
    expect(onCancel).toHaveBeenCalledTimes(2)

    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(3)
  })

  it('disables the buttons and shows a loading label while loading', () => {
    render(
      <DictaResetDialog bookTitle="ספר" onConfirm={vi.fn()} onCancel={vi.fn()} loading={true} isEditCopy={false} />
    )
    expect(screen.getByText('מאפס...')).toBeInTheDocument()
    expect(screen.getByText('מאפס...').closest('button')).toBeDisabled()
    expect(screen.getByText('ביטול').closest('button')).toBeDisabled()
  })
})
