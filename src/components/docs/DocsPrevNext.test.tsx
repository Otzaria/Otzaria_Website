import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DocsPrevNext from './DocsPrevNext'

describe('DocsPrevNext', () => {
  it('קודם ובא — קישורים עם rel ותווית', () => {
    render(<DocsPrevNext prev={{ slug: 'tools', title: 'כלים' }} next={{ slug: 'troubleshooting', title: 'פתרון תקלות' }} />)
    const prev = screen.getByRole('link', { name: /הקודם/ })
    const next = screen.getByRole('link', { name: /הבא/ })
    expect(prev).toHaveAttribute('href', '/docs/tools')
    expect(prev).toHaveAttribute('rel', 'prev')
    expect(prev).toHaveTextContent('כלים')
    expect(next).toHaveAttribute('href', '/docs/troubleshooting')
    expect(next).toHaveAttribute('rel', 'next')
  })

  it('חיצים בכיוון הקריאה ב-RTL: "הבא" שמאלה (chevron_left), "הקודם" ימינה (chevron_right)', () => {
    // גופן האייקונים אינו מראה חיצים ב-RTL, ולכן שם האייקון הוא הכיוון הפיזי שעל המסך
    render(<DocsPrevNext prev={{ slug: 'tools', title: 'כלים' }} next={{ slug: 'troubleshooting', title: 'פתרון תקלות' }} />)
    const icon = (name: RegExp) => screen.getByRole('link', { name }).querySelector('.material-symbols-outlined')
    expect(icon(/הבא/)).toHaveTextContent('chevron_left')
    expect(icon(/הקודם/)).toHaveTextContent('chevron_right')
  })

  it('רק הבא (הדף הראשון)', () => {
    render(<DocsPrevNext prev={null} next={{ slug: 'library', title: 'הספרייה' }} />)
    expect(screen.queryByRole('link', { name: /הקודם/ })).toBeNull()
    screen.getByRole('link', { name: /הבא/ })
  })

  it('בלי שניהם — לא מרונדר', () => {
    const { container } = render(<DocsPrevNext prev={null} next={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
