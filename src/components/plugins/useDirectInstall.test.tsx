import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDirectInstall } from './useDirectInstall'

// מוודא שה-useEffect שמציג alert על תוצאת ההתקנה (success/failure/no_app)
// באמת רץ בתוך ה-hook עצמו, כדי שדפי המסך לא יצטרכו לשכפל אותו.
describe('useDirectInstall showAlert effect', () => {
  const originalFetch = global.fetch
  const originalLocation = window.location

  beforeEach(() => {
    vi.useFakeTimers()
    // מחליפים את window.location באובייקט לכתיבה בלבד, כדי ש-install() יוכל
    // לבצע window.location.href = ... בלי שג'ידום ינסה לנווט בפועל
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    global.fetch = originalFetch
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation
    })
  })

  it('calls showAlert with the success message once install-result reports success', async () => {
    const showAlert = vi.fn()
    global.fetch = vi.fn(async (url: string) => {
      if (url.includes('install-token')) {
        return { ok: true, json: async () => ({ token: 'tok123' }) } as Response
      }
      if (url.includes('install-result')) {
        return { ok: true, status: 200, json: async () => ({ status: 'success', updated: false }) } as Response
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as unknown as typeof fetch

    const { result } = renderHook(() => useDirectInstall(showAlert))

    await act(async () => {
      await result.current.install({ id: 'p1', downloadUrl: 'https://example.com/p1.otzplugin' })
    })

    // מריצים את ה-tick הראשון של ה-polling כדי שהתשובה 'success' תתקבל
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(result.current.installState.phase).toBe('success')
    expect(showAlert).toHaveBeenCalledWith('הצלחה', 'התוסף הותקן בהצלחה באוצריא!')
  })

  it('does not throw or call anything when showAlert is not provided', async () => {
    global.fetch = vi.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch
    const { result } = renderHook(() => useDirectInstall())
    expect(result.current.installState.phase).toBe('idle')
  })
})
