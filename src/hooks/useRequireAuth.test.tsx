// בדיקות ל-useRequireAuth: מוודאות שהפנייה לדף ההתחברות קורית רק כשהמשתמש
// אינו מאומת, כוללת את הנתיב הנוכחי (callbackUrl) ולא קורית ב-loading/authenticated.
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRequireAuth } from './useRequireAuth'

const pushMock = vi.fn()
let mockStatus = 'loading'
let mockPathname = '/library/some-page'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: mockStatus }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => mockPathname,
}))

beforeEach(() => {
  pushMock.mockClear()
  mockStatus = 'loading'
  mockPathname = '/library/some-page'
})

describe('useRequireAuth', () => {
  test('לא מפנה לדף התחברות כשהסטטוס הוא loading', () => {
    mockStatus = 'loading'
    renderHook(() => useRequireAuth())
    expect(pushMock).not.toHaveBeenCalled()
  })

  test('לא מפנה לדף התחברות כשהמשתמש מאומת', () => {
    mockStatus = 'authenticated'
    renderHook(() => useRequireAuth())
    expect(pushMock).not.toHaveBeenCalled()
  })

  test('מפנה לדף ההתחברות עם callbackUrl של הנתיב הנוכחי כשלא מאומת', () => {
    mockStatus = 'unauthenticated'
    mockPathname = '/library/upload'
    renderHook(() => useRequireAuth())
    expect(pushMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/auth/login?callbackUrl=%2Flibrary%2Fupload')
  })

  test('מקודד כראוי נתיב עם תווים מיוחדים', () => {
    mockStatus = 'unauthenticated'
    mockPathname = '/library/ocr-training/abc?x=1'
    renderHook(() => useRequireAuth())
    expect(pushMock).toHaveBeenCalledWith(
      `/auth/login?callbackUrl=${encodeURIComponent('/library/ocr-training/abc?x=1')}`
    )
  })
})
