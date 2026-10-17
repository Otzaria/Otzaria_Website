import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Button, { isPlainAnchor } from './Button'

describe('Button', () => {
  it('בלי href — <button type="button"> עם הטקסט, והאייקון מוסתר מקורא מסך', () => {
    const onClick = vi.fn()
    render(<Button icon="download" onClick={onClick}>הורדה</Button>)
    const button = screen.getByRole('button', { name: 'הורדה' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.querySelector('.material-symbols-outlined')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('type="submit" נשמר', () => {
    render(<Button type="submit">שליחה</Button>)
    expect(screen.getByRole('button', { name: 'שליחה' })).toHaveAttribute('type', 'submit')
  })

  it('href פנימי — קישור', () => {
    render(<Button href="/about" variant="tonal">אודות</Button>)
    const link = screen.getByRole('link', { name: 'אודות' })
    expect(link).toHaveAttribute('href', '/about')
    expect(link.className).toContain('--button-tonal-bg')
  })

  it('עוגן באותו דף — <a> רגיל (לא ניווט Next)', () => {
    render(<Button href="#download">הורד</Button>)
    expect(screen.getByRole('link', { name: 'הורד' })).toHaveAttribute('href', '#download')
  })

  it('external — נפתח בלשונית חדשה עם rel בטוח', () => {
    render(<Button href="https://github.com/otzaria" external>GitHub</Button>)
    const link = screen.getByRole('link', { name: 'GitHub' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('loading — מושבת, aria-busy, ואייקון ההמתנה במקום האייקון', () => {
    const onClick = vi.fn()
    render(<Button icon="save" loading onClick={onClick}>שמירה</Button>)
    const button = screen.getByRole('button', { name: /שמירה/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.loader[aria-hidden="true"]')).not.toBeNull()
    expect(button).toHaveAccessibleName('שמירה')
    expect(button).not.toHaveTextContent('save')
  })

  it('קישור מושבת — aria-disabled, מחוץ לסדר הטאב, והלחיצה לא מנווטת', () => {
    render(<Button href="/donate" disabled>תרומה</Button>)
    const link = screen.getByRole('link', { name: 'תרומה' })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('iconOnly — השם הנגיש מ-aria-label', () => {
    render(<Button icon="close" iconOnly variant="text" aria-label="סגירה" />)
    expect(screen.getByRole('button', { name: 'סגירה' })).toBeInTheDocument()
  })

  it('icon כאלמנט (למשל אייקון מונפש) מוצג כמו שהוא', () => {
    render(<Button href="/donate" variant="donation" icon={<svg data-testid="anim" />}>לתרומה</Button>)
    expect(screen.getByTestId('anim')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לתרומה' })).toHaveClass('donation-button')
  })
})

describe('isPlainAnchor', () => {
  it.each([
    ['#download', true],
    ['https://example.com', true],
    ['mailto:a@b.c', true],
    ['//cdn.example.com/x', true],
    ['/about', false],
    ['plugins/all', false]
  ])('%s → %s', (href, expected) => {
    expect(isPlainAnchor(href)).toBe(expected)
  })
})
