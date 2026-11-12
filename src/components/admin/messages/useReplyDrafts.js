'use client'

import { useMemo, useRef } from 'react'

const STORAGE_KEY = 'admin-messages-reply-drafts'

const readStored = () => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeStored = (map) => {
  try {
    const entries = Object.fromEntries([...map].filter(([, text]) => text.trim() !== ''))
    if (Object.keys(entries).length === 0) window.sessionStorage.removeItem(STORAGE_KEY)
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // בלי אחסון (חלון פרטי וכו') — הטיוטה נשמרת רק בזיכרון של המסך
  }
}

/**
 * טיוטות של "השב", לפי שיחה — כדי שטקסט לא ילך לאיבוד: סגירת המגירה באמצע "שולח…" ושליחה שנכשלה אחר כך
 * ("פתח שוב" מחזיר את הטקסט), או התחברות שפגה (מעבר לדף ההתחברות וחזרה — sessionStorage, באותה לשונית בלבד).
 * @returns {{ get: (id: string) => string, set: (id: string, text: string) => void, clear: (id: string) => void }}
 */
export function useReplyDrafts() {
  const map = useRef(null)
  return useMemo(() => {
    const all = () => {
      if (!map.current) map.current = new Map(Object.entries(readStored()))
      return map.current
    }
    return {
      get: (id) => all().get(id) || '',
      set: (id, text) => {
        all().set(id, text)
        writeStored(all())
      },
      clear: (id) => {
        all().delete(id)
        writeStored(all())
      },
    }
  }, [])
}
