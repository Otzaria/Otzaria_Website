// יציאה מהמסך באמצע "אשר נבחרים": ההצעה שבאוויר מסתיימת (בזו אחר זו), ואחריה לא נשלחות עוד.
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const pending = []
vi.mock('./suggestionsApi', () => ({
  decideSuggestion: vi.fn(async () => ({})),
  batchDecideOne: vi.fn(() => new Promise((resolve) => { pending.push(() => resolve({ approved: 1 })) })),
}))

const { batchDecideOne, decideSuggestion } = await import('./suggestionsApi')
const { useSuggestionActions } = await import('./useSuggestionActions')

describe('useSuggestionActions', () => {
  test('יציאה מהמסך באמצע פעולה מרובה — לא נשלחות עוד בקשות', async () => {
    const { result, unmount } = renderHook(() => useSuggestionActions({
      data: { setItems: vi.fn(), refresh: vi.fn() }, toast: { show: vi.fn(), dismiss: vi.fn() }, confirm: vi.fn(async () => true),
    }))
    const edits = Array.from({ length: 5 }, (_, i) => ({ _id: `e${i}` }))
    let run
    act(() => { run = result.current.actions.bulk('approve', edits) })
    await act(async () => { await Promise.resolve() })
    expect(batchDecideOne).toHaveBeenCalledTimes(1)
    expect(result.current.bulkProgress).toEqual({ action: 'approve', done: 0, total: 5 })
    unmount()
    pending[0]()
    const left = await run
    expect(batchDecideOne).toHaveBeenCalledTimes(1)
    expect(left).toEqual(['e1', 'e2', 'e3', 'e4'])
  })
})

describe('useSuggestionActions — תקלה בשרת', () => {
  test('5xx עוצר את הפעולה המרובה בלי לנעול את המסך; מה שלא נשלח נשאר מסומן, וההודעה אומרת את הסיבה', async () => {
    batchDecideOne.mockImplementation(() => Promise.reject(Object.assign(new Error('אירעה שגיאה בשרת.'), { status: 500 })))
    const toast = { show: vi.fn(), dismiss: vi.fn() }
    const { result } = renderHook(() => useSuggestionActions({
      data: { setItems: vi.fn(), refresh: vi.fn() }, toast, confirm: vi.fn(async () => true),
    }))
    batchDecideOne.mockClear()
    const edits = Array.from({ length: 4 }, (_, i) => ({ _id: `e${i}` }))
    let left
    await act(async () => { left = await result.current.actions.bulk('approve', edits) })
    expect(batchDecideOne).toHaveBeenCalledTimes(1)
    expect(left).toEqual(['e0', 'e1', 'e2', 'e3'])
    expect(result.current.locked).toBeNull()
    const shown = toast.show.mock.calls.at(-1)[0]
    expect(shown.tone).toBe('error')
    expect(shown.message).toMatch(/נעצר: 3 לא נשלחו.*אירעה שגיאה בשרת\.$/)
  })
})

describe('useSuggestionActions — סגירת הלשונית בזמן ה"בטל"', () => {
  test('דחייה שממתינה — אותה בקשה ב-keepalive, פעם אחת; מה שבוטל — לא', () => {
    const toast = { show: vi.fn(() => 't'), dismiss: vi.fn() }
    const { result } = renderHook(() => useSuggestionActions({
      data: { setItems: vi.fn(), refresh: vi.fn() }, toast, confirm: vi.fn(),
    }))
    act(() => result.current.actions.decide({ _id: 'e1' }, 'reject'))
    act(() => result.current.actions.decide({ _id: 'e2' }, 'reject'))
    act(() => result.current.actions.cancelReject({ _id: 'e2' }))
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(decideSuggestion.mock.calls).toEqual([['e1', 'reject', undefined, { keepalive: true }]])
  })
})
