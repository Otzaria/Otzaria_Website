import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import usePortalMounted from './usePortalMounted'

describe('usePortalMounted', () => {
  it('מחזיר true אחרי ה-mount הראשוני (בצד הלקוח)', () => {
    const { result } = renderHook(() => usePortalMounted())
    expect(result.current).toBe(true)
  })

  it('ה-unmount לא זורק שגיאה (ה-cleanup תקין)', () => {
    const { unmount } = renderHook(() => usePortalMounted())
    expect(() => unmount()).not.toThrow()
  })
})
