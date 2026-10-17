import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DocsBreadcrumbs from './DocsBreadcrumbs'

describe('DocsBreadcrumbs', () => {
  it('nav בעל שם, רשימה סדורה, והפריט האחרון הוא הדף הנוכחי בלי קישור', () => {
    render(<DocsBreadcrumbs items={[{ label: 'בית', href: '/' }, { label: 'מדריך למשתמש', href: '/docs' }, { label: 'חיפוש' }]} />)
    const nav = screen.getByRole('navigation', { name: 'נתיב' })
    expect(nav.querySelector('ol')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'בית' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'מדריך למשתמש' })).toHaveAttribute('href', '/docs')
    expect(screen.queryByRole('link', { name: 'חיפוש' })).toBeNull()
    expect(screen.getByText('חיפוש')).toHaveAttribute('aria-current', 'page')
  })

  it('המפרידים דקורטיביים בלבד', () => {
    const { container } = render(<DocsBreadcrumbs items={[{ label: 'בית', href: '/' }, { label: 'דף' }]} />)
    const icons = container.querySelectorAll('.material-symbols-outlined')
    expect(icons).toHaveLength(1)
    expect(icons[0]).toHaveAttribute('aria-hidden', 'true')
    // בכיוון הקריאה (שמאלה) — הגופן אינו מראה חיצים ב-RTL
    expect(icons[0]).toHaveTextContent('chevron_left')
  })
})
