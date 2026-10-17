// הכותרת של האתר (OtzariaSoftwareHeader): ניווט עם שם נגיש ו-aria-current, והתפריט הנייד
// (useDisclosureMenu) — aria-controls, Esc, לחיצה בחוץ, החזרת פוקוס וסגירה במעבר נתיב.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let pathname = '/faq'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }), signOut: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, onClick, children, ...rest }) => (
    <a href={href} {...rest} onClick={(e) => { e.preventDefault(); onClick?.(e) }}>{children}</a>
  ),
}))

import OtzariaSoftwareHeader from './OtzariaSoftwareHeader'

const menuButton = () => screen.getByRole('button', { name: 'תפריט' })
const mobilePanel = () => document.getElementById(menuButton().getAttribute('aria-controls'))

beforeEach(() => {
  pathname = '/faq'
})

describe('OtzariaSoftwareHeader — ניווט', () => {
  test('ניווט ראשי עם שם נגיש, והקישור של הדף הנוכחי מסומן aria-current="page"', () => {
    render(<OtzariaSoftwareHeader />)
    const [desktopNav] = screen.getAllByRole('navigation', { name: 'ראשי' })
    expect(within(desktopNav).getByRole('link', { name: 'שאלות נפוצות' })).toHaveAttribute('aria-current', 'page')
    expect(within(desktopNav).getByRole('link', { name: 'מדריכים' })).not.toHaveAttribute('aria-current')
  })
})

describe('OtzariaSoftwareHeader — התפריט הנייד', () => {
  test('סגור: הפאנל קיים ב-DOM (יעד aria-controls) ומוסתר', () => {
    render(<OtzariaSoftwareHeader />)
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(mobilePanel()).not.toBeNull()
    expect(mobilePanel()).not.toBeVisible()
  })

  test('לחיצה פותחת; בפאנל — הקישורים, והדף הנוכחי מסומן aria-current', async () => {
    render(<OtzariaSoftwareHeader />)
    await userEvent.click(menuButton())
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
    const panel = mobilePanel()
    expect(panel).toBeVisible()
    expect(within(panel).getByRole('link', { name: 'שאלות נפוצות' })).toHaveAttribute('aria-current', 'page')
  })

  test('Esc סוגר ומחזיר את הפוקוס לכפתור', async () => {
    render(<OtzariaSoftwareHeader />)
    await userEvent.click(menuButton())
    within(mobilePanel()).getByRole('link', { name: 'מדריכים' }).focus()
    await userEvent.keyboard('{Escape}')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    expect(menuButton()).toHaveFocus()
  })

  test('לחיצה מחוץ לכפתור ולפאנל סוגרת', async () => {
    render(<><OtzariaSoftwareHeader /><p>תוכן הדף</p></>)
    await userEvent.click(menuButton())
    fireEvent.pointerDown(screen.getByText('תוכן הדף'))
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  test('לחיצה על קישור בפאנל סוגרת', async () => {
    render(<OtzariaSoftwareHeader />)
    await userEvent.click(menuButton())
    await userEvent.click(within(mobilePanel()).getByRole('link', { name: 'מדריכים' }))
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  test('מעבר נתיב שלא עבר דרך הפאנל (חזרה בדפדפן) סוגר', async () => {
    const { rerender } = render(<OtzariaSoftwareHeader />)
    await userEvent.click(menuButton())
    pathname = '/plugins'
    rerender(<OtzariaSoftwareHeader />)
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  test('showAuth — "התחבר" גם בתפריט הנייד; בלעדיו — לא', async () => {
    const { unmount } = render(<OtzariaSoftwareHeader showAuth />)
    await userEvent.click(menuButton())
    expect(within(mobilePanel()).getByRole('link', { name: 'התחבר' })).toBeInTheDocument()
    unmount()
    render(<OtzariaSoftwareHeader />)
    await userEvent.click(menuButton())
    expect(within(mobilePanel()).queryByRole('link', { name: 'התחבר' })).toBeNull()
  })
})
