import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditorPrefs } from './useEditorPrefs'
import { DEFAULT_EDITOR_PREFS, EDITOR_PREFS_STORAGE_KEY } from './editorPrefs'

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('useEditorPrefs', () => {
  it('טוען העדפות שמורות אחרי ה-mount', () => {
    window.localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, JSON.stringify({ version: 1, prefs: { theme: 'paper' } }))
    const { result } = renderHook(() => useEditorPrefs())
    expect(result.current.ready).toBe(true)
    expect(result.current.prefs.theme).toBe('paper')
  })

  it('רשומה מגרסה 5 עם עימוד ספר דלוק (ברירת המחדל הישנה) — נטען כבוי, וריווח "קבוע" נטען כ"צפוף"', () => {
    window.localStorage.setItem(EDITOR_PREFS_STORAGE_KEY, JSON.stringify({ version: 5, prefs: { paraWindow: true, paraFunnel: true, lineSpacing: 'fixed' } }))
    const { result } = renderHook(() => useEditorPrefs())
    expect(result.current.prefs).toMatchObject({ paraWindow: false, paraFunnel: false, lineSpacing: 'fixed', lineHeight: 'compact' })
  })

  it('setPrefs מעדכן וכותב לאחסון; ערך פסול נדחה', () => {
    const { result } = renderHook(() => useEditorPrefs())
    act(() => result.current.setPrefs({ fontSize: 22, theme: 'neon' }))
    expect(result.current.prefs.fontSize).toBe(22)
    expect(result.current.prefs.theme).toBe('light')
    const stored = JSON.parse(window.localStorage.getItem(EDITOR_PREFS_STORAGE_KEY))
    expect(stored.prefs.fontSize).toBe(22)
  })

  it('setPrefs עם פונקציה ו-resetPrefs', () => {
    const { result } = renderHook(() => useEditorPrefs())
    act(() => result.current.setPrefs((p) => ({ lineStrip: !p.lineStrip })))
    expect(result.current.prefs.lineStrip).toBe(true)
    act(() => result.current.resetPrefs())
    expect(result.current.prefs).toEqual(DEFAULT_EDITOR_PREFS)
  })

  it('אחסון חסום — לא נזרקת שגיאה, ההעדפות בזיכרון', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const { result } = renderHook(() => useEditorPrefs())
    expect(result.current.prefs).toEqual(DEFAULT_EDITOR_PREFS)
    act(() => result.current.setPrefs({ theme: 'evening' }))
    expect(result.current.prefs.theme).toBe('evening')
  })

  it('שינוי בלשונית אחרת (storage) מתעדכן', () => {
    const { result } = renderHook(() => useEditorPrefs())
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: EDITOR_PREFS_STORAGE_KEY,
        newValue: JSON.stringify({ version: 1, prefs: { fontFamily: 'frank' } })
      }))
    })
    expect(result.current.prefs.fontFamily).toBe('frank')
  })
})
