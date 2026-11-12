import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import Notice from './Notice'
import ExpandToggle from './ExpandToggle'

describe('Notice', () => {
  test('כותרת, הסבר ופעולה; מוכרז כ-status', () => {
    render(<Notice title="אי אפשר לאשר" action={<button type="button">דחה</button>}>הטקסט בספר השתנה</Notice>)
    const box = screen.getByRole('status')
    expect(box).toHaveTextContent('אי אפשר לאשר')
    expect(box).toHaveTextContent('הטקסט בספר השתנה')
    expect(screen.getByRole('button', { name: 'דחה' })).toBeInTheDocument()
  })
  test('tone="error" ו-role="alert"', () => {
    render(<Notice tone="error" role="alert" title="שגיאה" />)
    expect(screen.getByRole('alert').className).toContain('bg-error-container')
  })
})

describe('ExpandToggle', () => {
  test('aria-expanded, aria-controls, והחץ לפי המצב', () => {
    const { rerender } = render(<ExpandToggle label="3 חלקים" expanded={false} controls="p1" onToggle={() => {}} />)
    const button = screen.getByRole('button', { name: /3 חלקים/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls', 'p1')
    expect(button).toHaveTextContent('expand_more')
    rerender(<ExpandToggle label="3 חלקים" expanded controls="p1" onToggle={() => {}} />)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveTextContent('expand_less')
  })
})
