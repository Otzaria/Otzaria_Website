// דף "פרטי ספרים": בדיקת ההרשאה בדף — מנהל כללי ומנהל ספרים רואים את המסך; מנהל ספרים-בלבד ומשתמש רגיל — "אין הרשאה"
// (כמו ה-proxy וה-API, hasBooksAccess).
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'

const session = vi.hoisted(() => ({ current: null }))
vi.mock('next-auth', () => ({ getServerSession: async () => session.current }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/components/admin/bookInfo/BookInfoScreen', () => ({ default: () => <p>המסך</p> }))

import AdminBookInfoPage from './page'

const renderPage = async () => render(await AdminBookInfoPage({ searchParams: Promise.resolve({}) }))

describe('דף פרטי ספרים — הרשאה', () => {
  beforeEach(() => { session.current = null })

  test.each(['admin', 'admin_books'])('%s — המסך', async (role) => {
    session.current = { user: { role } }
    const page = await AdminBookInfoPage({ searchParams: Promise.resolve({}) })
    expect(page.type).toBe(Suspense)
  })

  test.each(['admin_books_only', 'user', undefined])('%s — "אין הרשאה"', async (role) => {
    session.current = role ? { user: { role } } : null
    await renderPage()
    expect(screen.getByText(/המסך פתוח למנהל כללי ולמנהל ספרים/)).toBeInTheDocument()
    expect(screen.queryByText('המסך')).toBeNull()
  })
})
