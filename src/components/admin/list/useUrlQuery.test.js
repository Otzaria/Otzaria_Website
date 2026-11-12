// useUrlQuery — המצב מהכתובת (parse), כתיבה בלי ניווט (replace / push), ו-setQuery יציב כל עוד הנתיב לא השתנה.
import { describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSyncExternalStore } from 'react'

vi.mock('next/navigation', () => {
  const subscribe = (cb) => {
    window.addEventListener('test-url', cb)
    return () => window.removeEventListener('test-url', cb)
  }
  return {
    usePathname: () => window.location.pathname,
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
  }
})

import { useUrlQuery } from './useUrlQuery'

const parse = (params) => ({ q: params.get('q') || '', page: Number(params.get('page')) || 1 })
const serialize = (query) => {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.page > 1) params.set('page', String(query.page))
  const text = params.toString()
  return text ? `?${text}` : ''
}

describe('useUrlQuery', () => {
  test('קורא מהכתובת; replace כברירת מחדל, push כשמבקשים — בלי ניווט', () => {
    window.history.replaceState(null, '', '/library/admin/x?q=abc')
    const length = window.history.length
    const { result, rerender } = renderHook(() => useUrlQuery(parse, serialize))
    expect(result.current[0]).toEqual({ q: 'abc', page: 1 })
    const setQuery = result.current[1]

    act(() => {
      result.current[1]({ q: 'דוד', page: 1 })
      window.dispatchEvent(new Event('test-url'))
    })
    expect(window.location.pathname).toBe('/library/admin/x')
    expect(new URLSearchParams(window.location.search).get('q')).toBe('דוד')
    expect(window.history.length).toBe(length)
    expect(result.current[0]).toEqual({ q: 'דוד', page: 1 })

    act(() => {
      result.current[1]({ q: 'דוד', page: 3 }, { push: true })
      window.dispatchEvent(new Event('test-url'))
    })
    expect(window.history.length).toBe(length + 1)
    expect(result.current[0].page).toBe(3)

    rerender()
    expect(result.current[1]).toBe(setQuery)
  })

  test('replace שומר את ה-state של הרשומה (הסימון של ההגנה על שינויים), ו-push לא מעתיק אותו', () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {}, __unsavedGuard: true }, '', '/library/admin/x')
    const { result } = renderHook(() => useUrlQuery(parse, serialize))
    act(() => result.current[1]({ q: 'a', page: 1 }))
    expect(window.history.state).toEqual({ __unsavedGuard: true })
    act(() => result.current[1]({ q: 'a', page: 2 }, { push: true }))
    expect(window.history.state).toBeNull()
  })
})
