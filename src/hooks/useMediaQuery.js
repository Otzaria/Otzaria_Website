'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * האם media query מתקיים (למשל '(max-width: 767px)'). מתעדכן בשינוי גודל החלון.
 * בשרת וב-render הראשון של ה-hydration — false (serverValue), כדי שה-HTML יהיה זהה.
 *
 * @param {string} query
 * @param {boolean} [serverValue=false]
 */
export function useMediaQuery(query, serverValue = false) {
  const subscribe = useCallback((onChange) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const list = window.matchMedia(query)
    list.addEventListener?.('change', onChange)
    return () => list.removeEventListener?.('change', onChange)
  }, [query])
  const getSnapshot = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : serverValue)
  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue)
}

export default useMediaQuery
