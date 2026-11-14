// מגירה בכתובת: פתיחה ב-push וסגירה ב"אחורה"; קישור ישיר — סגירה בהחלפת הכתובת; markPushed.
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDrawerParam } from './useDrawerParam'

describe('useDrawerParam', () => {
  test('פתיחה — push ו-opener; סגירה — "אחורה", ופעם שנייה — החלפת הכתובת', () => {
    const setQuery = vi.fn()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const { result } = renderHook(() => useDrawerParam(setQuery))
    act(() => result.current.open('b1', { book: 'b1' }))
    expect(setQuery).toHaveBeenLastCalledWith({ book: 'b1' }, { push: true })
    expect(result.current.openerRef.current).toBe('b1')
    act(() => result.current.setOpener('b2'))
    expect(result.current.openerRef.current).toBe('b2')
    act(() => result.current.close({ book: '' }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(setQuery).toHaveBeenCalledTimes(1)
    act(() => result.current.close({ book: '' }))
    expect(back).toHaveBeenCalledTimes(1)
    expect(setQuery).toHaveBeenLastCalledWith({ book: '' })
    back.mockRestore()
  })

  test('קישור ישיר (בלי פתיחה כאן) — סגירה מחליפה את הכתובת; markPushed — "אחורה"', () => {
    const setQuery = vi.fn()
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const { result } = renderHook(() => useDrawerParam(setQuery))
    act(() => result.current.close({ user: '' }))
    expect(setQuery).toHaveBeenLastCalledWith({ user: '' })
    expect(back).not.toHaveBeenCalled()
    act(() => result.current.markPushed())
    act(() => result.current.close({ user: '' }))
    expect(back).toHaveBeenCalledTimes(1)
    back.mockRestore()
  })
})
