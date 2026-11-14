// "רענן": לוחץ — onClick; busy — נעול (aria-disabled), הלחיצה לא מגיעה.
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RefreshButton from './RefreshButton'

describe('RefreshButton', () => {
  test('לחיצה — onClick', async () => {
    const onClick = vi.fn()
    render(<RefreshButton onClick={onClick} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'רענן' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('busy — נעול; label אחר', async () => {
    const onClick = vi.fn()
    render(<RefreshButton onClick={onClick} busy label="טען שוב" />)
    const button = screen.getByRole('button', { name: 'טען שוב' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    await userEvent.setup().click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
