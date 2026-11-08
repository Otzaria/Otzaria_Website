import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ErrorState from './ErrorState'

describe('ErrorState', () => {
  test('role="alert" ו"נסה שוב"', () => {
    const onRetry = vi.fn()
    render(<ErrorState title="לא הצלחנו לטעון את האשפה" description="השרת לא החזיר את הרשימה." onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('לא הצלחנו לטעון את האשפה')
    fireEvent.click(screen.getByRole('button', { name: 'נסה שוב' }))
    expect(onRetry).toHaveBeenCalled()
  })

  test('action — במקום "נסה שוב" (למשל "התחבר")', () => {
    render(<ErrorState title="פג תוקף ההתחברות" onRetry={vi.fn()} action={<a href="/auth/login">התחבר</a>} />)
    expect(screen.getByRole('link', { name: 'התחבר' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'נסה שוב' })).not.toBeInTheDocument()
  })
})
