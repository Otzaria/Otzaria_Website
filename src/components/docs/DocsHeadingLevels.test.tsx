import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DocsHeadingLevels from './DocsHeadingLevels'

describe('DocsHeadingLevels', () => {
  it('כותרת h3 ורשימה, ומספר הרמה נקרא בטקסט של כל שורה', () => {
    render(<DocsHeadingLevels title="דוגמה 1: מסכת" rows={[{ level: 1, label: 'מסכת ברכות' }, { level: 2, label: 'פרק ראשון' }]} />)
    screen.getByRole('heading', { level: 3, name: 'דוגמה 1: מסכת' })
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveTextContent('2פרק ראשון')
    expect(items[1].className).toContain('ms-6')
  })
})
