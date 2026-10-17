import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ForeverTagline from './ForeverTagline'

describe('ForeverTagline', () => {
  it('לקורא מסך — משפט אחד שלם, והאנימציה מוסתרת', () => {
    const { container } = render(<ForeverTagline play={false} />)
    expect(screen.getByText('חינם לנצח')).toHaveClass('sr-only')
    expect(container.querySelector('[aria-hidden="true"]')).toContainElement(screen.getByTestId('forever-final'))
  })

  it('"לנצח!" מפורק לאותיות לפי הסדר, עם אינדקס לעיכוב', () => {
    render(<ForeverTagline play={false} />)
    const letters = screen.getByTestId('forever-final').querySelectorAll('.forever-letter')
    expect(Array.from(letters, (el) => el.textContent).join('')).toBe('לנצח!')
    expect((letters[4] as HTMLElement).style.getPropertyValue('--i')).toBe('4')
  })

  it('השורה היא תמיד הצירוף המלא — "חינם" ראשון, כך שב-RTL הוא מימין', () => {
    const { container } = render(<ForeverTagline play={false} />)
    const line = container.querySelector('.forever-line') as HTMLElement
    expect(line.textContent).toBe('חינםלנצח!')
    expect(line).toHaveAttribute('aria-hidden', 'true')
    expect(line.firstElementChild).toHaveClass('forever-first')
    expect(line.style.getPropertyValue('--forever-shift')).toMatch(/px$/)
  })

  it('שתי המילים ב-OT Vilna: "חינם" Regular כהה, "לנצח!" Regular בצבע הראשי — בלי קו תחתון', () => {
    const { container } = render(<ForeverTagline play={false} />)
    const first = container.querySelector('.forever-first') as HTMLElement
    const final = screen.getByTestId('forever-final')
    expect(first).toHaveClass('font-display', 'font-normal', 'text-on-surface')
    expect(final).toHaveClass('font-display', 'font-normal', 'text-primary')
    expect(container.querySelector('.forever-underline')).toBeNull()
  })

  it('הרצף מתחיל רק כש-play מופעל', () => {
    const { container, rerender } = render(<ForeverTagline play={false} />)
    expect(container.firstChild).toHaveAttribute('data-state', 'idle')
    rerender(<ForeverTagline play />)
    expect(container.firstChild).toHaveAttribute('data-state', 'play')
  })
})
