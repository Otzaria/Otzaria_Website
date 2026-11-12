'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** כמה זמן יש ל"בטל" לפני שהבקשה יוצאת (מ"ש) */
export const UNDO_DELAY_MS = 6000

/**
 * פעולה הרסנית שאי אפשר להחזיר בשרת (דחיית הצעה, בחירת נוסח בהתנגשות) — עם "בטל" לפני שהיא קורית:
 * schedule רושם אותה, והיא רצה רק אחרי delay. cancel בזמן הזה — כאילו לא נלחץ דבר. בשרת אין "ביטול
 * דחייה", ולכן זו הדרך היחידה לתת רשת ביטחון בלי חלון אישור על כל לחיצה.
 *
 * יציאה מהמסך (unmount) עם פעולות שעוד לא יצאו — הן נשלחות מיד: מה שהמשתמש החליט לא הולך לאיבוד.
 * סגירת הלשונית / רענון (pagehide) — אין כבר דף שיריץ את run ויחכה לתשובה, ולכן נשלח onExit (אם נמסר): אותה
 * בקשה, ב-keepalive, בלי לחכות לתשובה. כל פעולה — פעם אחת בלבד (היא יוצאת מהרשימה), ומה שבוטל — לא נשלח.
 * (המנגנון שהיה במסך העמודים, עכשיו לכל מי שמשתמש כאן.) פעולה בלי onExit — כמו קודם (אזהרת הדפדפן אצל המסך).
 * pending — המפתחות שממתינים (לתצוגה: "תידחה בעוד כמה שניות · בטל"). flush — שולח מיד פעולה שממתינה
 * (למשל כשסוגרים את המגירה שבה היא הוצגה, בלי לחכות לטיימר).
 *
 * @param {{ delay?: number }} [options]
 * @returns {{ schedule: (key: any, run: () => unknown, options?: { onExit?: () => unknown }) => void, cancel: (key: any) => boolean,
 *   flush: (key: any) => boolean, pending: Set<any> }}
 */
export function useDeferredActions({ delay = UNDO_DELAY_MS } = {}) {
  const timers = useRef(new Map()) // key → { timer, run }
  const [pending, setPending] = useState(() => new Set())
  const sync = useCallback(() => setPending(new Set(timers.current.keys())), [])

  const schedule = useCallback((key, run, { onExit } = {}) => {
    if (timers.current.has(key)) return
    const timer = setTimeout(() => {
      timers.current.delete(key)
      sync()
      run()
    }, delay)
    timers.current.set(key, { timer, run, onExit })
    sync()
  }, [delay, sync])

  const cancel = useCallback((key) => {
    const entry = timers.current.get(key)
    if (!entry) return false
    clearTimeout(entry.timer)
    timers.current.delete(key)
    sync()
    return true
  }, [sync])

  const flush = useCallback((key) => {
    const entry = timers.current.get(key)
    if (!entry) return false
    clearTimeout(entry.timer)
    timers.current.delete(key)
    sync()
    entry.run()
    return true
  }, [sync])

  // הדף נסגר / מתרענן עם פעולה שממתינה — נשלחת עכשיו, בבקשה ששורדת את הסגירה (אחרת הייתה הולכת לאיבוד)
  // ידוע ומוכר: run() (עדכון המסך אחרי הצלחה) לא רץ כאן. אם הדף נשמר ב-bfcache וחוזרים אליו ב"אחורה", השורה
  // נראית "רגילה" אף שבשרת הפעולה כבר בוצעה — עד הרענון הבא. אין כאן האזנה ל-pageshow בכוונה (סקירה, ממצא 3).
  useEffect(() => {
    if (pending.size === 0) return undefined
    const onHide = () => {
      let sent = false
      for (const [key, entry] of timers.current) {
        if (!entry.onExit) continue
        clearTimeout(entry.timer)
        timers.current.delete(key)
        sent = true
        try {
          Promise.resolve(entry.onExit()).catch(() => {})
        } catch {
          // הדפדפן סירב (למשל יותר מדי בקשות keepalive) — אין מה לעשות כשהדף נסגר
        }
      }
      if (sent) sync()
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [pending, sync])

  useEffect(() => {
    const map = timers.current
    return () => {
      // יציאה מהמסך: מה שעוד לא יצא — יוצא עכשיו
      // פעולה שנכשלה (גם אסינכרונית) לא עוצרת את השאר ולא מדלגת על map.clear()
      try {
        for (const { timer, run } of map.values()) {
          clearTimeout(timer)
          try {
            Promise.resolve(run()).catch(() => {})
          } catch {
            // ממשיכים לפעולה הבאה
          }
        }
      } finally {
        map.clear()
      }
    }
  }, [])

  return useMemo(() => ({ schedule, cancel, flush, pending }), [schedule, cancel, flush, pending])
}
