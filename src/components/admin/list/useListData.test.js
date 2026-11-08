import { describe, expect, test, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useListData, useLoadedData } from './useListData'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useListData', () => {
  test('טעינה ראשונה, ואז ready עם הרשימה', async () => {
    const loader = vi.fn(async () => [{ id: 1 }])
    const { result } = renderHook(() => useListData(loader))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.items).toEqual([{ id: 1 }])
  })

  test('כשל בטעינה הראשונה — מסך שגיאה; retry טוען שוב', async () => {
    const loader = vi.fn().mockRejectedValueOnce(Object.assign(new Error('x'), { status: 500 })).mockResolvedValue([])
    const { result } = renderHook(() => useListData(loader))
    await waitFor(() => expect(result.current.status).toBe('error'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  test('רענון שקט שנכשל — הרשימה נשארת, ו-onRefreshError מודיע', async () => {
    const onRefreshError = vi.fn()
    const loader = vi.fn().mockResolvedValueOnce([{ id: 1 }]).mockRejectedValueOnce(Object.assign(new Error('x'), { status: 500 }))
    const { result } = renderHook(() => useListData(loader, { onRefreshError }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let ok
    await act(async () => { ok = await result.current.refresh() })
    expect(ok).toBe(false)
    expect(result.current.status).toBe('ready')
    expect(result.current.items).toEqual([{ id: 1 }])
    expect(onRefreshError).toHaveBeenCalledTimes(1)
  })

  test('רענון שקט עם התחברות שפגה — מסך שגיאה', async () => {
    const loader = vi.fn().mockResolvedValueOnce([{ id: 1 }]).mockRejectedValueOnce(Object.assign(new Error('x'), { status: 401, sessionExpired: true }))
    const { result } = renderHook(() => useListData(loader))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => { await result.current.refresh() })
    expect(result.current.status).toBe('error')
  })

  test('תשובה ישנה לא דורסת שינוי מקומי שנעשה בזמן שהיא באוויר — נטען שוב', async () => {
    const first = deferred()
    const loader = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue([{ id: 'fresh' }])
    const { result } = renderHook(() => useListData(loader))
    act(() => result.current.setItems([{ id: 'local' }]))
    await act(async () => { first.resolve([{ id: 'stale' }]) })
    await waitFor(() => expect(result.current.items).toEqual([{ id: 'fresh' }]))
    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('preloaded — נתונים מהשרת: ready מההתחלה, בלי טעינה ראשונה; refresh טוען', async () => {
    const loader = vi.fn(async () => ['fresh'])
    const { result } = renderHook(() => useLoadedData(loader, { initial: ['server'], preloaded: true }))
    expect(result.current.status).toBe('ready')
    expect(result.current.data).toEqual(['server'])
    await act(async () => {})
    expect(loader).not.toHaveBeenCalled()
    await act(async () => { await result.current.refresh() })
    expect(result.current.data).toEqual(['fresh'])
  })

  test('initialError — הטעינה בשרת נכשלה: שגיאה מההתחלה, ו-retry טוען', async () => {
    const loader = vi.fn(async () => ['x'])
    const { result } = renderHook(() => useLoadedData(loader, { initial: [], initialError: { message: 'x', status: 0 } }))
    expect(result.current.status).toBe('error')
    await act(async () => {})
    expect(loader).not.toHaveBeenCalled()
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })
})
