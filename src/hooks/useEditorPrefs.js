'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_EDITOR_PREFS,
  EDITOR_PREFS_STORAGE_KEY,
  editorPrefsEqual,
  mergeEditorPrefs,
  parseStoredEditorPrefs,
  serializeEditorPrefs
} from './editorPrefs'

function readStored(key) {
  try {
    return parseStoredEditorPrefs(window.localStorage.getItem(key))
  } catch {
    // חלון פרטי / אחסון חסום — ברירות מחדל
    return { ...DEFAULT_EDITOR_PREFS }
  }
}

function writeStored(key, prefs) {
  try {
    window.localStorage.setItem(key, serializeEditorPrefs(prefs))
  } catch {
    // אחסון מלא או חסום — ההעדפה נשארת בזיכרון לביקור הנוכחי
  }
}

/**
 * העדפות התצוגה של העורך, שמורות ב-localStorage.
 *
 * הקריאה מהאחסון נעשית אחרי ה-mount (לא ב-render הראשון), כדי שה-HTML מהשרת וה-render
 * הראשון בדפדפן יהיו זהים (ברירות המחדל) — `ready` אומר שההעדפות השמורות כבר נטענו.
 * שינוי בלשונית אחרת (אירוע storage) מתעדכן גם כאן.
 *
 * @returns {{ prefs: typeof DEFAULT_EDITOR_PREFS, setPrefs: (patch: object | ((p: object) => object)) => void, resetPrefs: () => void, ready: boolean }}
 */
export function useEditorPrefs(storageKey = EDITOR_PREFS_STORAGE_KEY) {
  const [prefs, setState] = useState(() => ({ ...DEFAULT_EDITOR_PREFS }))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // סנכרון חד-פעמי מהאחסון אחרי ה-hydration (מערכת חיצונית) — לא ניתן לעשות זאת ב-render
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readStored(storageKey))
    setReady(true)
    const onStorage = (event) => {
      if (event.key !== storageKey) return
      const next = parseStoredEditorPrefs(event.newValue)
      setState((current) => (editorPrefsEqual(current, next) ? current : next))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey])

  const setPrefs = useCallback((patch) => {
    setState((current) => {
      const next = mergeEditorPrefs(current, typeof patch === 'function' ? patch(current) : patch)
      if (editorPrefsEqual(current, next)) return current
      writeStored(storageKey, next)
      return next
    })
  }, [storageKey])

  const resetPrefs = useCallback(() => {
    const next = { ...DEFAULT_EDITOR_PREFS }
    writeStored(storageKey, next)
    setState(next)
  }, [storageKey])

  return { prefs, setPrefs, resetPrefs, ready }
}

export default useEditorPrefs
