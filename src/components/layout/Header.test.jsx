// בדיקות לכותרת הספרייה: התפריט הנייד (aria-expanded/aria-controls, Esc שמחזיר פוקוס, לחיצה
// בחוץ, סגירה אחרי ניווט ובשינוי כתובת), שם נגיש לקישור האווטאר ולמונה ההודעות.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LIBRARY_NAV_LINKS } from '@/lib/navigation-constants'

let session = null
let pathname = '/library/books'
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: session }),
  signOut: vi.fn(),
}))
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
// קישור בלי ניווט אמיתי — jsdom לא מממש ניווט בין מסמכים (ומדפיס על כך שגיאה)
vi.mock('next/link', () => ({
  default: ({ href, prefetch, onClick, children, ...rest }) => (
    <a href={href} {...rest} onClick={(e) => { e.preventDefault(); onClick?.(e) }}>{children}</a>
  ),
}))
vi.mock('@/lib/api-utils', () => ({ apiGet: vi.fn().mockResolvedValue({ success: true, count: 0 }) }))
vi.mock('next/image', () => ({ default: ({ alt }) => <span role="img" aria-label={alt} /> }))

import Header from './Header'

const getMenuButton = () => screen.getByRole('button', { name: 'תפריט' })

beforeEach(() => {
  session = null
  pathname = '/library/books'
})

describe('Header — התפריט הנייד', () => {
  test('סגור בהתחלה: aria-expanded=false, ו-aria-controls מצביע על הפאנל המוסתר', () => {
    render(<Header />)
    const button = getMenuButton()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    const panel = document.getElementById(button.getAttribute('aria-controls'))
    expect(panel).not.toBeNull()
    expect(panel).not.toBeVisible()
  })

  test('לחיצה פותחת את הפאנל עם כל קישורי הניווט של המחשב, וכפתור התחברות', async () => {
    render(<Header />)
    await userEvent.click(getMenuButton())

    const button = getMenuButton()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById(button.getAttribute('aria-controls'))
    expect(panel).toBeVisible()

    const links = within(panel).getAllByRole('link')
    expect(links.slice(0, LIBRARY_NAV_LINKS.length).map(l => l.getAttribute('href')))
      .toEqual(LIBRARY_NAV_LINKS.map(l => l.href))
    expect(within(panel).getByRole('link', { name: /ספרים/, current: 'page' })).toHaveAttribute('href', '/library/books')
    expect(within(panel).getByRole('link', { name: /התחבר/ })).toHaveAttribute('href', '/auth/login')
  })

  test('Esc סוגר ומחזיר את הפוקוס לכפתור', async () => {
    render(<Header />)
    await userEvent.click(getMenuButton())
    const panel = document.getElementById(getMenuButton().getAttribute('aria-controls'))
    within(panel).getAllByRole('link')[0].focus()

    await userEvent.keyboard('{Escape}')
    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(getMenuButton()).toHaveFocus()
    expect(panel).not.toBeVisible()
  })

  test('Esc כשהפוקוס מחוץ לתפריט — סוגר בלי למשוך את הפוקוס לכפתור; Esc שטופל כבר — לא סוגר', async () => {
    render(<><Header /><input aria-label="שדה" /></>)
    await userEvent.click(getMenuButton())
    const field = screen.getByRole('textbox', { name: 'שדה' })

    field.addEventListener('keydown', (e) => e.preventDefault(), { once: true })
    field.focus()
    await userEvent.keyboard('{Escape}')
    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'true')

    await userEvent.keyboard('{Escape}')
    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(field).toHaveFocus()
  })

  test('שינוי כתובת (למשל חזרה אחורה) סוגר את התפריט', async () => {
    const { rerender } = render(<Header />)
    await userEvent.click(getMenuButton())
    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'true')

    pathname = '/library/info'
    rerender(<Header />)
    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  test('לחיצה מחוץ לתפריט סוגרת אותו; לחיצה בתוכו לא', async () => {
    render(<><Header /><p>תוכן</p></>)
    await userEvent.click(getMenuButton())
    const panel = document.getElementById(getMenuButton().getAttribute('aria-controls'))

    fireEvent.pointerDown(panel)
    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'true')

    fireEvent.pointerDown(screen.getByText('תוכן'))
    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  test('בחירת קישור בתפריט סוגרת אותו', async () => {
    render(<Header />)
    await userEvent.click(getMenuButton())
    const panel = document.getElementById(getMenuButton().getAttribute('aria-controls'))
    fireEvent.click(within(panel).getAllByRole('link')[1])
    expect(getMenuButton()).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('Header — משתמש מחובר', () => {
  test('כפתור החשבון נקרא לפי השם המלא (לא רק המילה הראשונה), ובתפריט הנייד — האזור האישי', async () => {
    session = { user: { name: 'משה כהן', role: 'user' } }
    render(<Header />)
    const account = screen.getByRole('button', { name: 'החשבון של משה כהן' })
    expect(account).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /התחבר/, hidden: true })).toBeNull()

    await userEvent.click(getMenuButton())
    const panel = document.getElementById(getMenuButton().getAttribute('aria-controls'))
    expect(within(panel).getByRole('link', { name: 'האזור האישי' })).toHaveAttribute('href', '/library/dashboard')
    expect(within(panel).queryByRole('link', { name: /ניהול/ })).toBeNull()
  })

  test('מנהל רואה בתפריט הנייד גם את "ניהול" ואת "התנתק"', async () => {
    session = { user: { name: 'admin', role: 'admin' } }
    render(<Header />)
    await userEvent.click(getMenuButton())
    const panel = document.getElementById(getMenuButton().getAttribute('aria-controls'))
    expect(within(panel).getByRole('link', { name: /ניהול/ })).toHaveAttribute('href', '/library/admin')
    expect(within(panel).getByRole('button', { name: /התנתק/ })).toBeInTheDocument()
  })

  test('מונה ההודעות נקרא עם הקשר ("3 הודעות חדשות"), והאייקונים מוסתרים מקורא המסך', async () => {
    const { apiGet } = await import('@/lib/api-utils')
    apiGet.mockResolvedValueOnce({ success: true, count: 3 })
    session = { user: { name: 'admin', role: 'admin' } }
    render(<Header />)
    const adminLinks = await screen.findAllByRole('link', { name: /^ניהול ?, 3 הודעות חדשות$/, hidden: true })
    expect(adminLinks.length).toBeGreaterThan(0)
  })
})
