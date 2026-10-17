import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import NotFoundContent, { NOT_FOUND_TITLE, NOT_FOUND_SUBTITLE } from './NotFoundContent'
import { NOT_FOUND_LINKS, CONTACT_EMAIL, BROKEN_LINK_SUBJECT, BROKEN_LINK_BODY, brokenLinkMailto } from './notFoundLinkData'

describe('NotFoundContent', () => {
  it('h1 אחד עם הנוסח, ושורת ההסבר', () => {
    render(<NotFoundContent />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(NOT_FOUND_TITLE)
    expect(screen.getByText(NOT_FOUND_SUBTITLE)).toBeInTheDocument()
  })

  it('האזור נקרא בשם הכותרת (aria-labelledby)', () => {
    render(<NotFoundContent />)
    expect(screen.getByRole('region', { name: NOT_FOUND_TITLE })).toBeInTheDocument()
  })

  it('הפעולה הראשית — "לדף הבית" אל / עם טבעת פוקוס', () => {
    render(<NotFoundContent />)
    const home = screen.getByRole('link', { name: 'לדף הבית' })
    expect(home).toHaveAttribute('href', '/')
    expect(home.className).toContain('focus-visible:outline')
  })

  it('דרכי ההמשך (site): ניווט בשם "לאן להמשיך" ובו כל הקישורים לפי הסדר', () => {
    render(<NotFoundContent />)
    const nav = screen.getByRole('navigation', { name: 'לאן להמשיך' })
    const hrefs = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/plugins', '/#download', '/docs', '/library'])
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.className).toContain('focus-visible:outline')
    }
  })

  it('context="library" — סדר הספרייה, עם רשימת הספרים', () => {
    render(<NotFoundContent context="library" />)
    const nav = screen.getByRole('navigation', { name: 'לאן להמשיך' })
    const hrefs = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(NOT_FOUND_LINKS.library.map((l) => l.href))
    expect(hrefs).toContain('/library/books')
  })

  it('דיווח על קישור שבור — mailto לכתובת הקיימת עם נושא מקודד', () => {
    render(<NotFoundContent />)
    const report = screen.getByRole('link', { name: 'כתוב לנו בדוא״ל על הקישור השבור' })
    expect(report).toHaveAttribute('href', brokenLinkMailto())
    expect(screen.getByText(CONTACT_EMAIL)).toBeInTheDocument()
    expect(report.getAttribute('href')).toBe(
      `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(BROKEN_LINK_SUBJECT)}&body=${encodeURIComponent(BROKEN_LINK_BODY)}`
    )
  })

  it('האיור דקורטיבי בלבד', () => {
    const { container } = render(<NotFoundContent />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    // האנימציה היחידה מבוטלת ב-reduced-motion
    const pulse = container.querySelector('.animate-pulse')?.getAttribute('class')
    expect(pulse).toContain('motion-reduce:animate-none')
    expect(pulse).toContain('[animation-iteration-count:3]')
  })

  it('הנוסח עומד בכללים: בלי "קוד פתוח"/"תוכנה חופשית", בלי פנייה ברבים', () => {
    const { container } = render(<NotFoundContent />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/קוד פתוח|תוכנה חופשית|קהילה/)
    expect(text).not.toMatch(/חזרו|כתבו|בחרו|מצטערים/)
  })
})
