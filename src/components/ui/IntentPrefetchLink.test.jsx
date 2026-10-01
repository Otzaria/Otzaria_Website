import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// next/link מוחלף בגרסה שחושפת את ערך ה-prefetch כ-data attribute, כדי לבדוק
// מתי הקישור עובר מ"בלי prefetch" לברירת המחדל.
vi.mock('next/link', () => ({
  default: ({ prefetch, href, children, ...rest }) => (
    <a href={href} data-prefetch={prefetch === null ? 'default' : String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}))

import IntentPrefetchLink from './IntentPrefetchLink'

describe('IntentPrefetchLink', () => {
  it('מתחיל בלי prefetch', () => {
    render(<IntentPrefetchLink href="/library/admin/users">משתמשים</IntentPrefetchLink>)
    expect(screen.getByRole('link', { name: 'משתמשים' }).dataset.prefetch).toBe('false')
  })

  it.each([
    ['ריחוף', (el) => fireEvent.mouseEnter(el)],
    ['פוקוס', (el) => fireEvent.focus(el)],
    ['נגיעה', (el) => fireEvent.touchStart(el)],
  ])('%s מחזיר את ברירת המחדל של prefetch', (_, trigger) => {
    render(<IntentPrefetchLink href="/x">קישור</IntentPrefetchLink>)
    const link = screen.getByRole('link', { name: 'קישור' })
    trigger(link)
    expect(link.dataset.prefetch).toBe('default')
  })

  it('מעביר הלאה handlers ומאפיינים של המשתמש', () => {
    const onMouseEnter = vi.fn()
    render(
      <IntentPrefetchLink href="/y" className="tab" onMouseEnter={onMouseEnter}>
        לשונית
      </IntentPrefetchLink>
    )
    const link = screen.getByRole('link', { name: 'לשונית' })
    expect(link.getAttribute('href')).toBe('/y')
    expect(link.className).toBe('tab')
    fireEvent.mouseEnter(link)
    expect(onMouseEnter).toHaveBeenCalledTimes(1)
  })
})
