// דף "דיווחים על עמודים": בדיקת ההרשאה בדף — מנהל כללי ומנהל ספרים רואים את המסך; מנהל ספרים-בלבד, מנהלים אחרים
// ומשתמש רגיל — "אין הרשאה" (כמו ה-API, hasBooksAccess).
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'

const session = vi.hoisted(() => ({ current: null }))
vi.mock('next-auth', () => ({ getServerSession: async () => session.current }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/components/admin/pageReports/PageReportsScreen', () => ({ default: () => <p>המסך</p> }))

import AdminPageReportsPage from './page'

describe('דף דיווחים על עמודים — הרשאה', () => {
  beforeEach(() => { session.current = null })

  test.each(['admin', 'admin_books'])('%s — המסך', async (role) => {
    session.current = { user: { role } }
    const page = await AdminPageReportsPage()
    expect(page.type).toBe(Suspense)
  })

  test.each(['admin_books_only', 'admin_plugins', 'admin_ocr', 'user', undefined])('%s — "אין הרשאה"', async (role) => {
    session.current = role ? { user: { role } } : null
    render(await AdminPageReportsPage())
    expect(screen.getByText(/המסך פתוח למנהל כללי ולמנהל ספרים/)).toBeInTheDocument()
    expect(screen.queryByText('המסך')).toBeNull()
  })
})
