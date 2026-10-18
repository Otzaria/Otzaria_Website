import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DocsToc from './DocsToc'

const ITEMS = [{ href: '#intro', label: 'הקדמה' }, { href: '#tools', label: 'כלים' }]

describe('DocsToc', () => {
  it('panel — nav בשם התווית, קישורי עוגן', () => {
    render(<DocsToc title="בעמוד זה" items={ITEMS} variant="panel" />)
    screen.getByRole('navigation', { name: 'בעמוד זה' })
    expect(screen.getByRole('link', { name: 'כלים' })).toHaveAttribute('href', '#tools')
  })

  it('panel — בלי כותרת גלויה (התווית רק ב-aria-label) ובלי סימון לפני מדידה', () => {
    const { container } = render(<DocsToc title="בעמוד זה" items={ITEMS} variant="panel" />)
    expect(container).not.toHaveTextContent('בעמוד זה')
    expect(container.querySelector('[aria-current]')).toBeNull()
  })

  it('folded — מקפל details סגור, והתווית בכותרת שלו', () => {
    const { container } = render(<DocsToc title="תוכן עניינים" items={ITEMS} variant="folded" />)
    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')
    expect(container.querySelector('summary')).toHaveTextContent('תוכן עניינים')
    expect(screen.getAllByRole('link', { hidden: true })).toHaveLength(2)
  })

  it('בלי פריטים — לא מרונדר', () => {
    const { container } = render(<DocsToc title="בעמוד זה" items={[]} variant="panel" />)
    expect(container).toBeEmptyDOMElement()
  })
})
