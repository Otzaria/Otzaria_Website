// useMediaQuery: מחזיר את מצב ה-query, מתעדכן באירוע change, מסיר מאזין ב-unmount,
// ובסביבה בלי matchMedia מחזיר את serverValue.
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMediaQuery } from './useMediaQuery'

function mockMatchMedia(initial) {
  let matches = initial
  const listeners = new Set()
  const mql = (query) => ({
    media: query,
    get matches() { return matches },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  })
  vi.stubGlobal('matchMedia', vi.fn(mql))
  window.matchMedia = globalThis.matchMedia
  return {
    listeners,
    set(value) { matches = value; for (const fn of [...listeners]) fn() },
  }
}

const original = window.matchMedia
afterEach(() => { vi.unstubAllGlobals(); window.matchMedia = original })

describe('useMediaQuery', () => {
  test('מחזיר את מצב ה-query ומתעדכן בשינוי', () => {
    const media = mockMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))
    expect(result.current).toBe(false)
    act(() => media.set(true))
    expect(result.current).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)')
  })

  test('unmount מסיר את המאזין', () => {
    const media = mockMatchMedia(true)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1px)'))
    expect(media.listeners.size).toBe(1)
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  test('בלי matchMedia — serverValue', () => {
    window.matchMedia = undefined
    const { result } = renderHook(() => useMediaQuery('(x)', true))
    expect(result.current).toBe(true)
  })
})
