// useTextViewToggle: ה-rAF הכפול שמחזיר את הסמן לשדה החדש מבוטל ב-unmount (לא רץ על DOM שכבר אינו של העורך)
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTextViewToggle } from './useTextViewToggle'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('useTextViewToggle', () => {
  it('unmount מבטל את ה-rAF שממתין', () => {
    document.body.innerHTML = '<div class="editor-container"><textarea>אב</textarea></div>'
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 42)
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const setPrefs = vi.fn()
    const { result, unmount } = renderHook(() => useTextViewToggle({ setPrefs }))
    result.current()
    expect(setPrefs).toHaveBeenCalledTimes(1)
    expect(raf).toHaveBeenCalledTimes(1)
    unmount()
    expect(caf).toHaveBeenCalledWith(42)
  })

  it('מעבר שני לפני שהראשון הסתיים — מבטל את הקודם', () => {
    document.body.innerHTML = '<div class="editor-container"><textarea>אב</textarea></div>'
    let id = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => ++id)
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const { result } = renderHook(() => useTextViewToggle({ setPrefs: vi.fn() }))
    result.current()
    result.current()
    expect(caf).toHaveBeenCalledWith(1)
  })
})
