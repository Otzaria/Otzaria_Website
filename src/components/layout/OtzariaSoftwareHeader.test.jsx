// הכותרת של האתר (OtzariaSoftwareHeader): ניווט עם שם נגיש ו-aria-current, והתפריט הנייד
// (useDisclosureMenu) — aria-controls, Esc, לחיצה בחוץ, החזרת פוקוס וסגירה במעבר נתיב.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let pathname = '/faq'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
let session = null
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: session, status: session ? 'authenticated' : 'unauthenticated' }),
  signOut: vi.fn(),
}))
vi.mock('@/lib/api-utils', () => ({ apiGet: vi.fn().mockResolvedValue({ success: true, count: 0 }) }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, onClick, children, ...rest }) => (
    <a href={href} {...rest} onClick={(e) => { e.preventDefault(); onClick?.(e) }}>{children}</a>
  ),
}))

import OtzariaSoftwareHeader from './OtzariaSoftwareHeader'

const menuButton = () => screen.getByRole('button', { name: 'תפריט' })
const mobilePanel = () => document.getElementById(menuButton().getAttribute('aria-controls'))

beforeEach(async () => {
  pathname = '/faq'
  session = null
  const { apiGet } = await import('@/lib/api-utils')
  apiGet.mockClear()
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
  test('קבוצות הקישורים מתויגות במזהה בלי "/" והוא מצביע על הכותרת הנכונה', () => {
    render(<OtzariaSoftwareHeader />)
    const groups = mobilePanel().querySelectorAll('[role="group"]')
    expect(groups.length).toBeGreaterThan(0)
    for (const group of groups) {
      const id = group.getAttribute('aria-labelledby')
      expect(id).not.toContain('/')
      expect(document.getElementById(id)).toBeInTheDocument()
    }
  })

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

// מונה ההודעות שלא נקראו — אותו hook ואותה תצוגה כמו בכותרת הספרייה (Header.test.jsx)
describe('OtzariaSoftwareHeader — מונה ההודעות (showAuth)', () => {
  test('מנהל בחנות: נקודה בכפתור החשבון ומונה ליד "ניהול" בתפריט הנייד; הבקשה נשלחת פעם אחת', async () => {
    const { apiGet } = await import('@/lib/api-utils')
    apiGet.mockResolvedValueOnce({ success: true, count: 3 })
    session = { user: { name: 'admin', role: 'admin' } }
    pathname = '/plugins'
    render(<OtzariaSoftwareHeader showAuth />)
    expect(await screen.findByRole('button', { name: 'החשבון של admin, 3 הודעות חדשות' })).toBeInTheDocument()
    await userEvent.click(menuButton())
    expect(within(mobilePanel()).getByRole('link', { name: /^ניהול ?, 3 הודעות חדשות$/ })).toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(apiGet).toHaveBeenCalledWith('/api/messages/unread-count')
  })

  test('אורח ומשתמש רגיל — אין בקשה ואין מונה', async () => {
    const { apiGet } = await import('@/lib/api-utils')
    const { unmount } = render(<OtzariaSoftwareHeader showAuth />)
    unmount()
    session = { user: { name: 'ב', role: 'user' } }
    render(<OtzariaSoftwareHeader showAuth />)
    expect(screen.getByRole('button', { name: 'החשבון של ב' })).toBeInTheDocument()
    expect(apiGet).not.toHaveBeenCalled()
  })

  test('בלי showAuth (דפי השיווק) — גם מנהל לא שואל את השרת', async () => {
    const { apiGet } = await import('@/lib/api-utils')
    session = { user: { name: 'admin', role: 'admin' } }
    render(<OtzariaSoftwareHeader />)
    await waitFor(() => expect(apiGet).not.toHaveBeenCalled())
  })
})
