import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InfoCard from './InfoCard'

describe('InfoCard', () => {
  it('אריח אייקון דקורטיבי, כותרת h3 וטקסט — בכרטיס סטטי (div)', () => {
    const { container } = render(<InfoCard icon="usb" title="העבר את הכונן">חבר את הכונן</InfoCard>)
    const card = container.firstElementChild as HTMLElement
    expect(card.tagName).toBe('DIV')
    expect(card.className).not.toContain('focus-visible')
    expect(screen.getByRole('heading', { level: 3, name: 'העבר את הכונן' })).toBeInTheDocument()
    expect(card.querySelector('[aria-hidden="true"]')).toHaveTextContent('usb')
    expect(screen.getByText('חבר את הכונן').tagName).toBe('P')
  })

  it('as="li", eyebrow מעל הכותרת, ו-className/style עוברים לכרטיס', () => {
    render(
      <ul>
        <InfoCard as="li" icon="download" title="הורד" eyebrow="שלב 1" className="h-full" style={{ animationDelay: '0.06s' }}>
          טקסט
        </InfoCard>
      </ul>
    )
    const item = screen.getByRole('listitem')
    expect(item).toHaveClass('flex', 'flex-col', 'gap-3', 'h-full')
    expect(item.style.animationDelay).toBe('0.06s')
    const eyebrow = screen.getByText('שלב 1')
    expect(eyebrow.nextElementSibling).toBe(screen.getByRole('heading', { name: 'הורד' }))
  })

  it('בלי eyebrow — רק הכותרת בעמודת הטקסט', () => {
    render(<InfoCard icon="extension" title="תוספים">טקסט</InfoCard>)
    expect(screen.getByRole('heading', { name: 'תוספים' }).previousElementSibling).toBeNull()
  })
})
