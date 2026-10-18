import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DocsGuideNav from './DocsGuideNav'

const NAV = [
  { slug: 'library', title: 'הספרייה' },
  { slug: 'search', title: 'חיפוש' }
]
const iconFor = () => 'menu_book'

describe('DocsGuideNav', () => {
  it('הדף הנוכחי מסומן aria-current, והשאר לא', () => {
    render(<DocsGuideNav title="מדריך למשתמש" items={NAV} current="search" iconFor={iconFor} variant="panel" />)
    screen.getByRole('navigation', { name: 'מדריך למשתמש' })
    expect(screen.getByRole('link', { name: 'חיפוש' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'הספרייה' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'הספרייה' })).toHaveAttribute('href', '/docs/library')
  })

  it('folded — בתוך details', () => {
    const { container } = render(<DocsGuideNav title="מדריך למשתמש" items={NAV} current="library" iconFor={iconFor} variant="folded" />)
    expect(container.querySelector('details summary')).toHaveTextContent('מדריך למשתמש')
  })

  it('ניווט ריק — לא מרונדר', () => {
    const { container } = render(<DocsGuideNav title="מדריך למשתמש" items={[]} current="x" iconFor={iconFor} variant="panel" />)
    expect(container).toBeEmptyDOMElement()
  })
})
