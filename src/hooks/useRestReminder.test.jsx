import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRestReminder } from './useRestReminder'

afterEach(() => { vi.useRealTimers() })

describe('useRestReminder', () => {
  it('כבוי — אין ספירה', () => {
    const { result } = renderHook(() => useRestReminder({ enabled: false, intervalMin: 20 }))
    expect(result.current.due).toBe(false)
    expect(result.current.remainingMs).toBeNull()
  })

  it('מופעל — מגיע לזמן אחרי המרווח, ו"אחר כך" דוחה ב-5 דקות', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useRestReminder({ enabled: true, intervalMin: 20 }))
    expect(result.current.remainingMs).toBe(20 * 60_000)
    act(() => { vi.advanceTimersByTime(20 * 60_000) })
    expect(result.current.due).toBe(true)
    act(() => { result.current.snooze() })
    expect(result.current.due).toBe(false)
    expect(result.current.remainingMs).toBe(5 * 60_000)
    act(() => { result.current.done() })
    expect(result.current.remainingMs).toBe(20 * 60_000)
  })
})
