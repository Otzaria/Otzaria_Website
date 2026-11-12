// יציאה מהמסך באמצע "אשר נבחרים": המילה שבאוויר מסתיימת (מילה אחר מילה), ואחריה לא נשלחות עוד.
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const pending = []
vi.mock('./dictionaryApi', () => ({
  sendWordRequest: vi.fn(() => new Promise((resolve) => { pending.push(resolve) })),
}))

const { sendWordRequest } = await import('./dictionaryApi')
const { useDictionaryActions } = await import('./useDictionaryActions')

const word = (w) => ({ word: w, users: [{ userId: 'u1', word: w, status: 'pending' }] })

describe('useDictionaryActions', () => {
  test('יציאה מהמסך באמצע פעולה מרובה — לא נשלחות עוד בקשות', async () => {
    const { result, unmount } = renderHook(() => useDictionaryActions({
      data: { data: { entries: [], skipped: [] }, setData: vi.fn(), refresh: vi.fn() },
      toast: { show: vi.fn(), dismiss: vi.fn() },
      confirm: vi.fn(async () => true),
    }))
    let run
    act(() => { run = result.current.actions.bulk('approve', ['a', 'b', 'c'].map(word)) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(sendWordRequest).toHaveBeenCalledTimes(1)
    expect(result.current.bulkProgress).toEqual({ action: 'approve', done: 0, total: 3 })
    unmount()
    pending[0]()
    const left = await run
    expect(sendWordRequest).toHaveBeenCalledTimes(1)
    expect(left).toEqual(['b', 'c'])
  })
})

describe('useDictionaryActions — תקלה בשרת', () => {
  test('5xx עוצר את הפעולה המרובה בלי לנעול את המסך; מה שלא נשלח נשאר מסומן, וההודעה אומרת את הסיבה', async () => {
    sendWordRequest.mockImplementation(() => Promise.reject(Object.assign(new Error('אירעה שגיאה בשרת.'), { status: 502 })))
    const toast = { show: vi.fn(), dismiss: vi.fn() }
    const { result } = renderHook(() => useDictionaryActions({
      data: { data: { entries: [], skipped: [] }, setData: vi.fn(), refresh: vi.fn() }, toast, confirm: vi.fn(async () => true),
    }))
    sendWordRequest.mockClear()
    let left
    await act(async () => { left = await result.current.actions.bulk('approve', ['a', 'b', 'c'].map(word)) })
    expect(sendWordRequest).toHaveBeenCalledTimes(1)
    expect(left).toEqual(['a', 'b', 'c'])
    expect(result.current.locked).toBeNull()
    const shown = toast.show.mock.calls.at(-1)[0]
    expect(shown.tone).toBe('error')
    expect(shown.message).toBe('לא נוספו מילים · מילה אחת לא עודכנה ונשארה מסומנת · הפעולה נעצרה. אירעה שגיאה בשרת.')
  })
})

describe('useDictionaryActions — סגירת הלשונית בזמן ה"בטל"', () => {
  test('פעולה שממתינה — אותן בקשות (לכל משתמש), ב-keepalive, פעם אחת', async () => {
    sendWordRequest.mockReset()
    sendWordRequest.mockImplementation(async () => ({ success: true }))
    const { result } = renderHook(() => useDictionaryActions({
      data: { data: { entries: [], skipped: [] }, setData: vi.fn(), refresh: vi.fn() }, toast: { show: vi.fn(), dismiss: vi.fn() }, confirm: vi.fn(),
    }))
    const w = { word: 'x', users: [{ userId: 'u1', word: 'x' }, { userId: 'u2', word: 'x' }] }
    act(() => result.current.actions.act(w, 'approve'))
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(sendWordRequest.mock.calls).toEqual([
      [{ action: 'add-global', userId: 'u1', word: 'x' }, { keepalive: true }],
      [{ action: 'add-global', userId: 'u2', word: 'x' }, { keepalive: true }],
    ])
    expect(result.current.pendingActions.size).toBe(1) // הסימון בשורה — עד הרענון (הדף נסגר)
  })
})
