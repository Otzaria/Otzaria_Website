import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SectionHeading from './SectionHeading'
import PageHeader from './PageHeader'
import TitleOrnament from './TitleOrnament'

describe('SectionHeading', () => {
  it('h2 עם id (ל-aria-labelledby), קישוט דקורטיבי ושורת משנה', () => {
    const { container } = render(<SectionHeading id="dl" title="הורדת התוכנה" subtitle="בחר מערכת" />)
    const heading = screen.getByRole('heading', { level: 2, name: 'הורדת התוכנה' })
    expect(heading).toHaveAttribute('id', 'dl')
    expect(heading.className).toContain('text-headline-md')
    expect(container.querySelector('.title-ornament')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('בחר מערכת')).toBeInTheDocument()
  })

  it('as קובע את הרמה הסמנטית, size את הגודל — בנפרד', () => {
    render(<SectionHeading as="h3" size="md" title="תת-אזור" ornament={false} />)
    const heading = screen.getByRole('heading', { level: 3 })
    expect(heading.className).toContain('text-headline-sm')
    expect(heading.parentElement?.querySelector('.title-ornament')).toBeNull()
  })

  it('spacing="none" — בלי margin חיצוני (ההורה קובע)', () => {
    const { container } = render(<SectionHeading title="א" spacing="none" />)
    expect((container.firstElementChild as HTMLElement).className).not.toMatch(/\bmb-/)
  })
})

describe('PageHeader', () => {
  it('h1 אחד בצבע on-surface, ופעולות אופציונליות מתחת', () => {
    render(<PageHeader title="חנות התוספים" actions={<button type="button">העלאת תוסף</button>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'חנות התוספים' })).toHaveClass('text-on-surface')
    expect(screen.getByRole('button', { name: 'העלאת תוסף' })).toBeInTheDocument()
  })
})

describe('TitleOrnament', () => {
  it('ratio/min → משתני CSS; data-* עוברים הלאה; תמיד aria-hidden', () => {
    const { container } = render(<TitleOrnament ratio="45%" min="96px" data-x="1" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.getPropertyValue('--ornament-ratio')).toBe('45%')
    expect(el.style.getPropertyValue('--ornament-min')).toBe('96px')
    expect(el).toHaveAttribute('data-x', '1')
    expect(el).toHaveAttribute('aria-hidden', 'true')
  })
})
