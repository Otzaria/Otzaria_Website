import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Button, { isPlainAnchor, safeHref } from './Button'

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

  it('aria-pressed — גם המראה הלחוץ (מקור אמת אחד)', () => {
    render(<><Button variant="text" size="tool" iconOnly icon="format_bold" aria-label="הדגשה" aria-pressed /><Button variant="text" size="tool" iconOnly icon="format_italic" aria-label="נטוי" aria-pressed={false} /></>)
    expect(screen.getByRole('button', { name: 'הדגשה' }).className).toContain('bg-(--tool-bg-pressed)')
    expect(screen.getByRole('button', { name: 'נטוי' }).className).not.toContain('bg-(--tool-bg-pressed)')
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

describe('safeHref', () => {
  it.each([
    ['/about', '/about'],
    ['#top', '#top'],
    ['//cdn.example.com/x', '//cdn.example.com/x'],
    ['https://example.com', 'https://example.com'],
    ['HTTP://example.com', 'HTTP://example.com'],
    ['mailto:a@b.c', 'mailto:a@b.c'],
    ['tel:+972500000000', 'tel:+972500000000'],
    ['javascript:alert(1)', undefined],
    ['JaVaScRiPt:alert(1)', undefined],
    [' javascript:alert(1)', undefined],
    ['java\nscript:alert(1)', undefined],
    ['java\tscript:alert(1)', undefined],
    ['data:text/html,<script>1</script>', undefined],
    ['vbscript:msgbox(1)', undefined]
  ])('%j → %j', (href, expected) => {
    expect(safeHref(href)).toBe(expected)
  })
})

describe('Button — href מסוכן', () => {
  it('javascript: לא מרונדר כקישור פעיל (בלי href, מושבת)', () => {
    render(<Button href="javascript:alert(1)">רע</Button>)
    const el = screen.getByText('רע').closest('a')!
    expect(el).not.toHaveAttribute('href')
    expect(el).toHaveAttribute('aria-disabled', 'true')
    expect(el).toHaveAttribute('tabindex', '-1')
  })

  it('גם עם external — scheme מסוכן לא עובר', () => {
    render(<Button href="data:text/html,x" external>רע</Button>)
    expect(screen.getByText('רע').closest('a')).not.toHaveAttribute('href')
  })

  it('mailto: ו-tel: נשארים <a> רגיל', () => {
    render(<><Button href="mailto:a@b.c">מייל</Button><Button href="tel:123">טלפון</Button></>)
    expect(screen.getByRole('link', { name: 'מייל' })).toHaveAttribute('href', 'mailto:a@b.c')
    expect(screen.getByRole('link', { name: 'טלפון' })).toHaveAttribute('href', 'tel:123')
  })
})
