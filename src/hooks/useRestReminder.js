'use client'

import { useCallback, useEffect, useState } from 'react'

const MINUTE = 60_000
/** "אחר כך" בתזכורת — עוד 5 דקות */
export const REST_SNOOZE_MIN = 5
const TICK_MS = 15_000

/**
 * תזמון תזכורת המנוחה (20-20-20) של העורך. כבוי (enabled=false) — אין טיימר ואין ספירה.
 * המחזור מתחיל מחדש כשהתזכורת מופעלת או כשהמרווח משתנה.
 *
 * @param {{ enabled: boolean, intervalMin: number }} options
 * @returns {{ due: boolean, remainingMs: number | null, snooze: () => void, done: () => void }}
 *   due — הגיע הזמן להציג את RestReminder; remainingMs — לשורת המצב (null כשכבוי).
 */
export function useRestReminder({ enabled, intervalMin }) {
  const [dueAt, setDueAt] = useState(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    const start = Date.now()
    // תחילת מחזור כשהתזכורת מופעלת (מערכת חיצונית: השעון) — לא ניתן לחשב ב-render
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(start)
    setDueAt(start + intervalMin * MINUTE)
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [enabled, intervalMin])

  const restart = useCallback((minutes) => {
    const t = Date.now()
    setNow(t)
    setDueAt(t + minutes * MINUTE)
  }, [])

  const snooze = useCallback(() => restart(REST_SNOOZE_MIN), [restart])
  const done = useCallback(() => restart(intervalMin), [restart, intervalMin])

  if (!enabled || dueAt == null) return { due: false, remainingMs: null, snooze, done }
  const remainingMs = Math.max(0, dueAt - now)
  return { due: remainingMs === 0, remainingMs, snooze, done }
}

export default useRestReminder
