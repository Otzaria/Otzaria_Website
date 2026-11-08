// מוני הניהול: ערך התחלתי מהשרת, רענון כל 60 שניות, ותפקיד בלי מונים — בלי בקשות בכלל.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { refreshAdminBadgeCounts, useAdminBadgeCounts } from './useAdminBadgeCounts'

const INITIAL = { unreadMessages: 1, pendingUploads: 2, pendingPlugins: 0 }

beforeEach(() => {
  vi.useFakeTimers()
  globalThis.fetch = vi.fn(async () => ({
    json: async () => ({ success: true, unreadMessages: 5, pendingUploads: 0, pendingPlugins: 4 }),
  }))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useAdminBadgeCounts', () => {
  test('מתחיל מהערך שהגיע מהשרת, בלי בקשה מיידית', () => {
    const { result } = renderHook(() => useAdminBadgeCounts('admin', INITIAL))
    expect(result.current).toEqual(INITIAL)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('מתרענן אחרי 60 שניות מ-/api/badge-counts', async () => {
    const { result } = renderHook(() => useAdminBadgeCounts('admin', INITIAL))
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(fetch).toHaveBeenCalledWith('/api/badge-counts')
    expect(result.current).toEqual({ unreadMessages: 5, pendingUploads: 0, pendingPlugins: 4 })
  })

  test('refreshAdminBadgeCounts — רענון מיידי (אחרי פעולה במסך), בלי לחכות לדקה', async () => {
    const { result } = renderHook(() => useAdminBadgeCounts('admin', INITIAL))
    await act(async () => {
      refreshAdminBadgeCounts()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual({ unreadMessages: 5, pendingUploads: 0, pendingPlugins: 4 })
  })

  test('תשובה בלי success — הערך הקודם נשמר', async () => {
    fetch.mockResolvedValueOnce({ json: async () => ({ success: false }) })
    const { result } = renderHook(() => useAdminBadgeCounts('admin', INITIAL))
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(result.current).toEqual(INITIAL)
  })

  test.each(['admin_ocr', 'admin_books_only', 'model_trainer', 'developer', undefined])('%s — בלי מונים, בלי בקשות', async (role) => {
    renderHook(() => useAdminBadgeCounts(role, INITIAL))
    await act(async () => { await vi.advanceTimersByTimeAsync(180000) })
    expect(fetch).not.toHaveBeenCalled()
  })
})
