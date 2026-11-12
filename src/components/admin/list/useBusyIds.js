'use client'

import { useCallback, useState } from 'react'

/**
 * מזהים עם בקשה פתוחה ברשימת ניהול (הכפתורים של השורה מושבתים בזמן הבקשה).
 * track(ids, fn) — מסמן את המזהים, מריץ את fn, ומסיר את הסימון בסוף (גם בכשל). מחזיר את מה ש-fn מחזירה.
 * שתי בקשות חופפות על אותו מזהה — הסימון יורד כשהראשונה מסתיימת (כמו בעותקים שהיו בכל מסך).
 *
 * @returns {{ busy: Set<any>, track: <T>(ids: any[], fn: () => Promise<T>) => Promise<T> }}
 */
export function useBusyIds() {
  const [busy, setBusy] = useState(() => new Set())

  const track = useCallback(async (ids, fn) => {
    setBusy((s) => new Set([...s, ...ids]))
    try {
      return await fn()
    } finally {
      setBusy((s) => {
        const next = new Set(s)
        for (const id of ids) next.delete(id)
        return next
      })
    }
  }, [])

  return { busy, track }
}
