import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import HeroStats from './HeroStats'
import { buildStatItems } from '@/lib/homeStats/homeStats'

describe('HeroStats', () => {
  it('מציג רק נתונים תקינים, בסדר הקבוע, עם תווית לכל אחד', () => {
    const items = buildStatItems({ books: 7367, links: 5812829, lines: 6031484, downloads: 73152, plugins: 0 })
    const { container } = render(<HeroStats items={items} />)
    expect(container.querySelector('dl')).toHaveAttribute('aria-label', 'אוצריא במספרים')
    const values = screen.getAllByTestId('hero-stat-value').map((el) => el.textContent)
    expect(values).toEqual(['7,367', '5.8מיליון', '73,152'])
    expect(screen.getByText('ספרים')).toBeInTheDocument()
    expect(screen.queryByText('פסקאות')).not.toBeInTheDocument()
    expect(screen.queryByText('תוספים')).not.toBeInTheDocument()
  })

  it('לקוראי מסך — המספר המדויק, והמקוצר מוסתר', () => {
    render(<HeroStats items={buildStatItems({ links: 5812829 })} />)
    expect(screen.getByText('5,812,829')).toHaveClass('sr-only')
    expect(screen.getByTestId('hero-stat-value')).toHaveAttribute('aria-hidden', 'true')
  })

  it('הגרסה — פריט אחרון בשורה, עם התווית "גרסה", בלי קיצור מספרי', () => {
    const { container } = render(<HeroStats items={buildStatItems({ books: 7367 })} version="0.9.98" />)
    const terms = Array.from(container.querySelectorAll('dt'), (el) => el.textContent)
    expect(terms).toEqual(['ספרים', 'גרסה'])
    expect(screen.getByTestId('hero-stat-version')).toHaveTextContent('0.9.98')
    // משתלבת בשורה: אותן מחלקות ערך כמו המספרים (לא primary)
    expect(screen.getByTestId('hero-stat-version').className).toBe(screen.getByTestId('hero-stat-value').parentElement?.className)
    expect(container.querySelectorAll('dl > div')).toHaveLength(2)
  })

  it('רק גרסה, בלי נתונים — עדיין מוצגת; בלי גרסה — הפריט לא קיים', () => {
    const { rerender } = render(<HeroStats items={[]} version="0.9.98" />)
    expect(screen.getByText('גרסה')).toBeInTheDocument()
    rerender(<HeroStats items={buildStatItems({ books: 7367 })} version={null} />)
    expect(screen.queryByText('גרסה')).not.toBeInTheDocument()
  })

  it('כל הנתונים חסרים — לא מרנדר דבר', () => {
    const { container } = render(<HeroStats items={buildStatItems({})} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('מסך צר: חמישה פריטים — 3 בשורה, ובלי קו הפרדה בראש כל שורה', () => {
    const items = buildStatItems({ books: 7367, links: 5812829, downloads: 73152, plugins: 40 })
    const { container } = render(<HeroStats items={items} version="0.9.98" />)
    expect(container.querySelector('dl')?.style.getPropertyValue('--stat-cols')).toBe('3')
    const rowStarts = Array.from(container.querySelectorAll('dl > div'), (el) => el.classList.contains('narrow:border-s-0'))
    expect(rowStarts).toEqual([true, false, false, true, false])
  })
})
