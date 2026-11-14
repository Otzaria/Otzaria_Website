// יציאה מהמסך באמצע פעולה מרובה: הבקשות שבאוויר מסתיימות, ואחריהן לא נשלחות עוד.
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const pending = []
vi.mock('./messagesApi', () => ({
  markRead: vi.fn(() => new Promise((resolve) => { pending.push(resolve) })),
  deleteMessage: vi.fn(),
  reply: vi.fn(),
}))
vi.mock('@/components/admin/shell/useAdminBadgeCounts', () => ({ refreshAdminBadgeCounts: vi.fn() }))

const { markRead } = await import('./messagesApi')
const { useMessageActions } = await import('./useMessageActions')

describe('useMessageActions', () => {
  test('יציאה מהמסך באמצע "סמן כנקרא" מרובה — לא נשלחות עוד בקשות', async () => {
    const toast = { show: vi.fn(), dismiss: vi.fn() }
    const { result, unmount } = renderHook(() => useMessageActions({
      data: { setData: vi.fn(), refresh: vi.fn(async () => true) }, toast, confirm: vi.fn(async () => true),
    }))
    const messages = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, status: 'unread' }))
    let run
    act(() => { run = result.current.bulk('read', messages) })
    await act(async () => { await Promise.resolve() })
    expect(markRead).toHaveBeenCalledTimes(4)
    expect(result.current.progress).toEqual({ action: 'read', done: 0, total: 9 })
    unmount()
    for (const resolve of pending) resolve()
    const left = await run
    expect(markRead).toHaveBeenCalledTimes(4)
    expect(left).toEqual(['m4', 'm5', 'm6', 'm7', 'm8'])
  })
})

describe('useMessageActions — תקלה בשרת', () => {
  test('5xx עוצר את הפעולה המרובה; מה שלא נשלח נשאר בבחירה, וההודעה אומרת את הסיבה', async () => {
    markRead.mockImplementation(() => Promise.reject(Object.assign(new Error('אירעה שגיאה בשרת.'), { status: 500 })))
    const toast = { show: vi.fn(), dismiss: vi.fn() }
    const { result } = renderHook(() => useMessageActions({
      data: { setData: vi.fn(), refresh: vi.fn(async () => true) }, toast, confirm: vi.fn(async () => true),
    }))
    markRead.mockClear()
    const messages = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, status: 'unread' }))
    let left
    await act(async () => { left = await result.current.bulk('read', messages) })
    expect(markRead).toHaveBeenCalledTimes(4)
    expect(left).toHaveLength(9)
    const shown = toast.show.mock.calls.at(-1)[0]
    expect(shown.tone).toBe('error')
    expect(shown.message).toBe('9 נכשלו ונשארו בבחירה. אירעה שגיאה בשרת.')
  })
})

describe('useMessageActions — סגירת הלשונית בזמן ה"בטל"', () => {
  test('"סמן כנקרא" שממתין — נשלח פעם אחת ב-keepalive; מה שבוטל ב"בטל" — לא', async () => {
    markRead.mockReset()
    markRead.mockImplementation(async () => ({ success: true }))
    const toast = { show: vi.fn(), dismiss: vi.fn() }
    const { result } = renderHook(() => useMessageActions({
      data: { setData: vi.fn(), refresh: vi.fn(async () => true) }, toast, confirm: vi.fn(),
    }))
    act(() => result.current.markRead({ id: 'm1', status: 'unread' }))
    act(() => result.current.markRead({ id: 'm2', status: 'unread' }))
    // "בטל" בהודעה של m2
    act(() => toast.show.mock.calls.at(-1)[0].action.onClick())
    expect([...result.current.pendingRead]).toEqual(['m1'])
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(markRead.mock.calls).toEqual([['m1', { keepalive: true }]])
    expect(result.current.pendingRead.size).toBe(0)
  })
})
