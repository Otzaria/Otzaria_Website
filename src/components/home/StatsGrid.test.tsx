import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsGrid from './StatsGrid'
import { buildStatItems } from '@/lib/homeStats/homeStats'

describe('StatsGrid', () => {
  it('מציג רק עיגולים עם נתון תקין, בסדר הקבוע', () => {
    const items = buildStatItems({ books: 7367, links: 5812829, lines: null, downloads: 122836, plugins: 0 })
    render(<StatsGrid items={items} />)
    expect(screen.getByRole('heading', { name: 'אוצריא במספרים' })).toBeInTheDocument()
    const values = screen.getAllByTestId('stat-value').map((el) => el.textContent)
    expect(values).toEqual(['7,367', '5,812,829', '122,836'])
    expect(screen.queryByText('פסקאות')).not.toBeInTheDocument()
    expect(screen.queryByText('תוספים')).not.toBeInTheDocument()
  })

  it('כל הנתונים חסרים — לא מרנדר דבר', () => {
    const { container } = render(<StatsGrid items={buildStatItems({})} />)
    expect(container).toBeEmptyDOMElement()
  })
})
