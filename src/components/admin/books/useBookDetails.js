'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchBookDetails } from './booksApi'

/**
 * הפרטים המלאים של ספר אחד (העמודים, עמוד הדוגמה, הנחיות העריכה העדכניות) — ללשוניות "עמודים"
 * ו"הנחיות עריכה" במגירה. נטען רק כש-enabled (בפעם הראשונה שפותחים לשונית שצריכה אותו), ונשמר
 * כל עוד המגירה פתוחה על אותו ספר. retry — טעינה מחדש. patch — עדכון הספר שנטען אחרי שמירה מוצלחת
 * (למשל הנחיות העריכה), כדי שמעבר בין לשוניות לא יחזיר את הטופס לנתון הישן.
 * @returns {{ status: 'idle' | 'loading' | 'ready' | 'error', data: { book: any, pages: any[] } | null,
 *   error: { message: string, sessionExpired: boolean } | null, retry: () => void, patch: (bookPatch: object) => void }}
 */
export function useBookDetails(path, enabled) {
  const [attempt, setAttempt] = useState(0)
  const key = `${path}:${attempt}`
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const [requested, setRequested] = useState(null)
  // בקשה אחת לכל מפתח: מתחילה בפעם הראשונה ש-enabled (בזמן הרינדור — בלי setState בתוך effect)
  if (enabled && path && requested !== key) setRequested(key)

  useEffect(() => {
    if (!requested) return undefined
    let cancelled = false
    fetchBookDetails(requested.slice(0, requested.lastIndexOf(':')))
      .then((data) => { if (!cancelled) setResult({ key: requested, data, error: null }) })
      .catch((e) => {
        if (!cancelled) setResult({ key: requested, data: null, error: { message: e?.message || 'לא הצלחנו לטעון את הספר.', sessionExpired: Boolean(e?.sessionExpired) } })
      })
    return () => { cancelled = true }
  }, [requested])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const patch = useCallback((bookPatch) => {
    setResult((r) => (r.data ? { ...r, data: { ...r.data, book: { ...r.data.book, ...bookPatch } } } : r))
  }, [])
  const current = result.key === key
  let status = 'idle'
  if (current) status = result.error ? 'error' : 'ready'
  else if (requested === key) status = 'loading'
  return { status, data: current ? result.data : null, error: current ? result.error : null, retry, patch }
}
