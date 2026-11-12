import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))

import TabLinks from './TabLinks'

const ITEMS = [
  { id: 'queue', href: '/q', label: 'תור', icon: 'checklist' },
  { id: 'admin', href: '/a', label: 'ניהול' },
]

describe('TabLinks', () => {
  test('ניווט עם שם, קישור לכל לשונית, ו-aria-current רק בפעילה', () => {
    render(<TabLinks label="תיקוני טקסט" items={ITEMS} activeId="admin" />)
    const nav = screen.getByRole('navigation', { name: 'תיקוני טקסט' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => [a.textContent.replace('checklist', ''), a.getAttribute('href')])).toEqual([['תור', '/q'], ['ניהול', '/a']])
    expect(links[0]).not.toHaveAttribute('aria-current')
    expect(links[1]).toHaveAttribute('aria-current', 'page')
  })

  test('בלי לשונית פעילה — אף קישור לא מסומן', () => {
    render(<TabLinks label="x" items={ITEMS} activeId={null} />)
    expect(screen.getAllByRole('link').filter((a) => a.hasAttribute('aria-current'))).toHaveLength(0)
  })

  test('shortLabel: השם הקצר לעין בלבד, והשם הנגיש המלא', () => {
    render(<TabLinks label="x" items={[{ id: 'a', href: '/a', label: 'סידור החנות', shortLabel: 'סידור' }]} activeId="a" />)
    expect(screen.getByRole('link', { name: 'סידור החנות' })).toBeInTheDocument()
    expect(screen.getByText('סידור')).toHaveAttribute('aria-hidden', 'true')
  })

  test('countOnPhone=false: המספר נשאר בשם הנגיש, ומוסתר רק בטלפון', () => {
    render(<TabLinks label="x" items={[{ id: 'a', href: '/a', label: 'בחנות', count: 86, countOnPhone: false }]} activeId="a" />)
    expect(screen.getByRole('link', { name: /^בחנות\s*86$/ })).toBeInTheDocument()
    expect(screen.getByText('86').className).toContain('max-sm:sr-only')
  })

  test('שורה נגללת: הלשונית הפעילה נגללת לתוך השורה', () => {
    const rect = (left, right) => ({ left, right, top: 0, bottom: 0, width: right - left, height: 0, x: left, y: 0, toJSON() {} })
    const widths = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(500)
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    const rects = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function box() {
      return this.tagName === 'NAV' ? rect(0, 300) : rect(-120, -20)
    })
    render(<TabLinks label="x" items={ITEMS} activeId="admin" />)
    expect(screen.getByRole('navigation', { name: 'x' }).scrollLeft).toBe(-120)
    widths.mockRestore()
    client.mockRestore()
    rects.mockRestore()
  })

  test('האייקון דקורטיבי — השם הנגיש הוא הטקסט בלבד', () => {
    render(<TabLinks label="x" items={ITEMS} activeId="queue" />)
    expect(screen.getByRole('link', { name: 'תור' })).toBeInTheDocument()
  })

  test('countLabel — המספר מוסבר לקורא המסך ("נכנסות, 8 חדשות")', () => {
    render(<TabLinks label="x" items={[{ id: 'in', href: '/i', label: 'נכנסות', count: 8, countLabel: '8 חדשות' }]} activeId="in" />)
    expect(screen.getByRole('link', { name: 'נכנסות, 8 חדשות' })).toBeInTheDocument()
  })
})
