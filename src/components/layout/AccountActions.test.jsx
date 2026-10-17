// בדיקות לאזור החשבון המשותף (כותרת הספרייה + כותרת האתר בחנות התוספים): אורח, טעינה,
// מחובר (כפתור חשבון בלי שם ותפריט נפתח נגיש), "ניהול" לפי תפקיד, ו-OtzariaSoftwareHeader showAuth.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const signOut = vi.fn()
let session = null
let status = 'unauthenticated'
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: session, status }),
  signOut: (...args) => signOut(...args),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/plugins/abc' }))
vi.mock('next/link', () => ({
  default: ({ href, prefetch, onClick, children, ...rest }) => (
    <a href={href} {...rest} onClick={(e) => { e.preventDefault(); onClick?.(e) }}>{children}</a>
  ),
}))

import AccountActions from './AccountActions'
import OtzariaSoftwareHeader from './OtzariaSoftwareHeader'

const demoUser = (role = 'user') => ({ user: { name: 'ישראל ישראלי', email: 'demo@example.invalid', role } })
const accountButton = () => screen.getByRole('button', { name: /^החשבון של ישראל ישראלי/ })
const accountPanel = () => document.getElementById(accountButton().getAttribute('aria-controls'))

beforeEach(() => {
  session = null
  status = 'unauthenticated'
  signOut.mockClear()
})

describe('AccountActions — שורת הכותרת', () => {
  test('אורח: רק "התחבר", בתוך אזור החשבון', () => {
    const { container } = render(<AccountActions session={null} status="unauthenticated" loginCallbackUrl="/plugins" />)
    const login = screen.getByRole('link', { name: 'התחבר' })
    expect(login).toHaveAttribute('href', '/auth/login?callbackUrl=%2Fplugins')
    expect(container.querySelector('[data-account-slot]')).toHaveAttribute('data-state', 'guest')
    expect(container.querySelector('[data-account-slot]')).toContainElement(login)
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('טוען: skeleton דקורטיבי בלבד — בלי "התחבר" שמתחלף אחר כך, ובלי שום דבר נגיש', () => {
    const { container } = render(<AccountActions session={null} status="loading" />)
    const slot = container.querySelector('[data-account-slot]')
    expect(slot).toHaveAttribute('data-state', 'loading')
    expect(slot.querySelector('[data-account-skeleton]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('מחובר: כפתור חשבון אחד בלי השם בטקסט (רק האות הראשונה) — השם המלא והאימייל ב-title; התפריט סגור עד לחיצה', () => {
    const { container } = render(<AccountActions session={demoUser()} status="authenticated" />)
    expect(container.querySelector('[data-account-slot]')).toHaveAttribute('data-state', 'user')
    expect(screen.queryByRole('link', { name: /התחבר/ })).toBeNull()
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false')
    expect(accountButton()).not.toHaveTextContent('ישראל')
    expect(accountButton()).toHaveTextContent('י')
    expect(accountButton()).toHaveAttribute('title', 'ישראל ישראלי\ndemo@example.invalid')
    expect(accountPanel()).not.toBeVisible()
  })

  test('לחיצה פותחת: שם, אימייל, האזור האישי והתנתקות; משתמש רגיל — בלי "ניהול"', async () => {
    render(<AccountActions session={demoUser()} status="authenticated" signOutCallbackUrl="/plugins/abc" />)
    await userEvent.click(accountButton())
    expect(accountButton()).toHaveAttribute('aria-expanded', 'true')
    const panel = accountPanel()
    expect(panel).toBeVisible()
    expect(within(panel).getByText('ישראל ישראלי')).toBeInTheDocument()
    expect(within(panel).getByText('demo@example.invalid')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'האזור האישי' })).toHaveAttribute('href', '/library/dashboard')
    expect(within(panel).queryByRole('link', { name: /ניהול/ })).toBeNull()

    await userEvent.click(within(panel).getByRole('button', { name: 'התנתק' }))
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/plugins/abc' })
  })

  test('מנהל: "ניהול" בתפריט, ומונה ההודעות גם בשם הנגיש של הכפתור', async () => {
    render(<AccountActions session={demoUser('admin')} status="authenticated" unreadMessages={3} />)
    expect(accountButton()).toHaveAccessibleName('החשבון של ישראל ישראלי, 3 הודעות חדשות')
    await userEvent.click(accountButton())
    expect(within(accountPanel()).getByRole('link', { name: /ניהול/ })).toHaveAttribute('href', '/library/admin')
  })

  test('מקלדת: חץ למטה פותח ועובר לפריט הראשון; Esc סוגר ומחזיר פוקוס לכפתור', async () => {
    render(<AccountActions session={demoUser('admin')} status="authenticated" />)
    accountButton().focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(accountButton()).toHaveAttribute('aria-expanded', 'true')
    await vi.waitFor(() => expect(within(accountPanel()).getByRole('link', { name: 'האזור האישי' })).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    expect(within(accountPanel()).getByRole('link', { name: /ניהול/ })).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false')
    expect(accountButton()).toHaveFocus()
  })
})

test('Tab שיוצא מהתפריט אל רכיב אחר סוגר אותו', async () => {
  render(<><AccountActions session={demoUser()} status="authenticated" /><button type="button">אחר</button></>)
  await userEvent.click(accountButton())
  expect(accountButton()).toHaveAttribute('aria-expanded', 'true')
  await userEvent.tab() // האזור האישי
  await userEvent.tab() // התנתק
  await userEvent.tab() // יוצא
  expect(screen.getByRole('button', { name: 'אחר' })).toHaveFocus()
  expect(accountButton()).toHaveAttribute('aria-expanded', 'false')
})

describe('AccountActions — תפריט נייד (compact)', () => {
  test('אורח: "התחבר" ברוחב מלא', () => {
    render(<AccountActions session={null} status="unauthenticated" compact />)
    const login = screen.getByRole('link', { name: 'התחבר' })
    expect(login).toHaveAttribute('href', '/auth/login')
    // בלי אזור החשבון של שורת הכותרת (רוחב קבוע) — בתפריט הנייד הוא ברוחב התפריט
    expect(login.closest('[data-account-slot]')).toBeNull()
  })

  test('מחובר: תוכן התפריט עצמו, בלי כפתור חשבון', () => {
    render(<AccountActions session={demoUser('developer')} status="authenticated" compact />)
    expect(screen.queryByRole('button', { name: /החשבון של/ })).toBeNull()
    expect(screen.getByRole('link', { name: /ניהול/ })).toHaveAttribute('href', '/library/admin/app-reports')
    expect(screen.getByRole('button', { name: 'התנתק' })).toBeInTheDocument()
  })

  test('טוען: כלום', () => {
    const { container } = render(<AccountActions session={null} status="loading" compact />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('OtzariaSoftwareHeader showAuth', () => {
  test('אורח: "התחבר" חוזר לדף הנוכחי', () => {
    render(<OtzariaSoftwareHeader showAuth />)
    expect(screen.getByRole('link', { name: /התחבר/ })).toHaveAttribute('href', '/auth/login?callbackUrl=%2Fplugins%2Fabc')
  })

  test('מחובר: כפתור החשבון, וההתנתקות משאירה באותו דף', async () => {
    session = demoUser()
    status = 'authenticated'
    render(<OtzariaSoftwareHeader showAuth />)
    expect(screen.queryByRole('link', { name: /התחבר/ })).toBeNull()
    await userEvent.click(accountButton())
    await userEvent.click(within(accountPanel()).getByRole('button', { name: 'התנתק' }))
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/plugins/abc' })
  })

  test('ברירת המחדל (דף הבית ודפי השיווק) — בלי אזור חשבון ובלי מקום שמור ריק', () => {
    session = demoUser()
    status = 'authenticated'
    const { container } = render(<OtzariaSoftwareHeader />)
    expect(screen.queryByRole('link', { name: /התחבר/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /החשבון של/ })).toBeNull()
    expect(container.querySelector('[data-account-slot]')).toBeNull()
  })
})
