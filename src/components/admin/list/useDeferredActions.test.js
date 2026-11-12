import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDeferredActions } from './useDeferredActions'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useDeferredActions', () => {
  test('הפעולה רצה רק אחרי ההשהיה, ובינתיים היא ב-pending', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => result.current.schedule('a', run))
    expect(result.current.pending.has('a')).toBe(true)
    act(() => { vi.advanceTimersByTime(999) })
    expect(run).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(run).toHaveBeenCalledTimes(1)
    expect(result.current.pending.has('a')).toBe(false)
  })

  test('"בטל" לפני הזמן — לא נשלח כלום', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => result.current.schedule('a', run))
    let cancelled
    act(() => { cancelled = result.current.cancel('a') })
    expect(cancelled).toBe(true)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(run).not.toHaveBeenCalled()
    expect(result.current.cancel('a')).toBe(false)
  })

  test('אותו מפתח פעמיים (לחיצה כפולה) — פעולה אחת', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => {
      result.current.schedule('a', run)
      result.current.schedule('a', run)
    })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('יציאה מהמסך — מה שעוד לא יצא נשלח מיד', () => {
    const run = vi.fn()
    const { result, unmount } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => result.current.schedule('a', run))
    unmount()
    expect(run).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('יציאה מהמסך — פעולה שנכשלה (סינכרונית או אסינכרונית) לא עוצרת את השאר', async () => {
    const first = vi.fn(() => { throw new Error('נכשל') })
    const second = vi.fn(() => Promise.reject(new Error('נכשל')))
    const third = vi.fn()
    const { result, unmount } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => {
      result.current.schedule('a', first)
      result.current.schedule('b', second)
      result.current.schedule('c', third)
    })
    expect(() => unmount()).not.toThrow()
    await Promise.resolve()
    expect([first, second, third].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])
  })

  test('flush — שולח עכשיו, פעם אחת, ולא שוב כשהטיימר היה אמור לפוג', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => result.current.schedule('a', run))
    let sent
    act(() => { sent = result.current.flush('a') })
    expect(sent).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(result.current.pending.has('a')).toBe(false)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(run).toHaveBeenCalledTimes(1)
    expect(result.current.flush('a')).toBe(false)
  })
})

describe('useDeferredActions — סגירת הלשונית (pagehide)', () => {
  const hide = () => act(() => { window.dispatchEvent(new Event('pagehide')) })

  test('בתוך זמן ה"בטל" — onExit נשלח פעם אחת בלבד, ו-run לא רץ (גם לא בטיימר ולא ביציאה מהמסך)', () => {
    const run = vi.fn()
    const onExit = vi.fn()
    const { result, unmount } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => result.current.schedule('a', run, { onExit }))
    hide()
    hide()
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(result.current.pending.size).toBe(0)
    act(() => { vi.advanceTimersByTime(5000) })
    unmount()
    expect(run).not.toHaveBeenCalled()
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  test('פעולה שבוטלה — לא נשלחת; שאר הפעולות — כן', () => {
    const exits = { a: vi.fn(), b: vi.fn() }
    const { result } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => {
      result.current.schedule('a', vi.fn(), { onExit: exits.a })
      result.current.schedule('b', vi.fn(), { onExit: exits.b })
    })
    act(() => { result.current.cancel('a') })
    hide()
    expect(exits.a).not.toHaveBeenCalled()
    expect(exits.b).toHaveBeenCalledTimes(1)
  })

  test('פעולה שכבר יצאה (הטיימר) — לא נשלחת שוב', () => {
    const run = vi.fn()
    const onExit = vi.fn()
    const { result } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => result.current.schedule('a', run, { onExit }))
    act(() => { vi.advanceTimersByTime(1000) })
    hide()
    expect(run).toHaveBeenCalledTimes(1)
    expect(onExit).not.toHaveBeenCalled()
  })

  test('בלי onExit — לא נוגעים בה (ממשיכה כרגיל); onExit שנכשל לא זורק', () => {
    const run = vi.fn()
    const { result } = renderHook(() => useDeferredActions({ delay: 1000 }))
    act(() => {
      result.current.schedule('a', run)
      result.current.schedule('b', vi.fn(), { onExit: () => Promise.reject(new Error('x')) })
      result.current.schedule('c', vi.fn(), { onExit: () => { throw new Error('y') } })
    })
    expect(() => hide()).not.toThrow()
    expect([...result.current.pending]).toEqual(['a'])
    act(() => { vi.advanceTimersByTime(1000) })
    expect(run).toHaveBeenCalledTimes(1)
  })
})
