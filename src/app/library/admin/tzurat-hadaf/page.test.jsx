// דף הניהול של צורת הדף: מנהל כללי ומנהל ספרים — המסך; כל תפקיד אחר (ומי שלא מחובר, אם ה-proxy לא עצר אותו) —
// "אין הרשאה". אותה קבוצת תפקידים כמו קודם (hasTzuratAdminAccess) — רק במקום הפניה ללוח הניהול, הסבר.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const session = vi.hoisted(() => ({ current: null }))
vi.mock('next-auth', () => ({ getServerSession: async () => session.current }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/components/admin/tzurat/TzuratScreen', () => ({ default: () => <div data-testid="tzurat-admin" /> }))

import Page from './page'

const renderPage = async () => render(await Page())

beforeEach(() => {
  session.current = null
})

describe('/library/admin/tzurat-hadaf', () => {
  it.each(['admin', 'admin_books'])('%s — רואה את המסך', async (role) => {
    session.current = { user: { role } }
    await renderPage()
    expect(screen.getByTestId('tzurat-admin')).toBeInTheDocument()
  })

  it.each(['admin_ocr', 'user', 'admin_books_only', 'admin_plugins', undefined])('%s — "אין הרשאה"', async (role) => {
    session.current = role ? { user: { role } } : null
    await renderPage()
    expect(screen.queryByTestId('tzurat-admin')).toBeNull()
    expect(screen.getByText(/המסך פתוח למנהל כללי ולמנהל ספרים/)).toBeInTheDocument()
  })
})
