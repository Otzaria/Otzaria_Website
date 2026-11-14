// לשונית "מנויים" (במקום הטסט של BookSubscribersModal): רשימה, חיפוש, ריק, והסרה אחרי אישור.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ui/Toast'
import SubscribersScreen from './SubscribersScreen'

vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/library/admin/books/subscribers' }))
vi.setConfig({ testTimeout: 20000 })

const SUBS = [{ name: 'דוד', email: 'david@example.com', hasAccount: true }, { name: '', email: 'anon@example.com', hasAccount: false }]
let calls
beforeEach(() => {
  calls = []
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
    return { ok: true, status: 200, type: 'basic', redirected: false, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ success: true }) }
  })
})
const renderScreen = (props) => render(<ToastProvider><SubscribersScreen initialSubscribers={SUBS} {...props} /></ToastProvider>)

describe('SubscribersScreen', () => {
  test('רשימה עם שם וכתובת; כתובת בלי חשבון — תג "אין חשבון באתר"', () => {
    renderScreen()
    const list = screen.getByRole('list', { name: 'המנויים' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('אין חשבון באתר')).toBeInTheDocument()
    expect(within(list).queryByText('בלי שם')).toBeNull()
    expect(screen.getByText('2 מנויים')).toBeInTheDocument()
  })

  test('אין מנויים — מצב ריק', () => {
    renderScreen({ initialSubscribers: [] })
    expect(screen.getByText('אין מנויים')).toBeInTheDocument()
  })

  test('"הסר" — אחרי אישור בלבד, שולח את הכתובת ומוריד את השורה', async () => {
    const user = userEvent.setup()
    renderScreen()
    await user.click(screen.getByRole('button', { name: 'הסר את דוד מהמנויים' }))
    const dialog = screen.getByRole('dialog', { name: 'להסיר את המנוי?' })
    expect(calls).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'הסר' }))
    await waitFor(() => expect(screen.queryByText('david@example.com')).toBeNull())
    expect(calls).toEqual([expect.objectContaining({ url: '/api/admin/mailing-list/delete', method: 'DELETE', body: { email: 'david@example.com' } })])
  })
})
