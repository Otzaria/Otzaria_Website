'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isFatal as isRequestFatal } from '@/lib/adminList/requestErrors'
import { runLimited } from '@/lib/runLimited'

/**
 * פעולה מרובה ברשימות הניהול (כשאין נקודת קצה מרובה ויוצאת בקשה לכל פריט): כמה בקשות במקביל (limit), התקדמות
 * ("3 מתוך 12") ו"עצור" (מה שבאוויר מסתיים, ואחריו לא נשלחות עוד). כשל קטלני (isFatal; ברירת המחדל — זה של
 * lib/adminList/requestErrors: ההרשאה אבדה או תקלה בשרת) — עוצרים מיד.
 * יציאה מהמסך (unmount) באמצע — עוצרת גם היא: לא נשלחות עוד בקשות.
 *
 * limit — לכל מסך מה שהיה לו: 4 במקביל ברוב המסכים; 1 (בזו אחר זו) באימון, במילון, בהצעות ובשיבוץ תוספים.
 *
 * run(items, fn, { meta, showProgress, limit }) — מחזיר את התוצאה של runLimited כמו שהיא
 *   ({ done, failed: [{ item, error }], fatal, stopped, notAttempted }).
 *   meta — שדות נוספים ל-progress (למשל { action }); showProgress=false — בלי progress (פריט בודד).
 * progress — { ...meta, done, total } בזמן ריצה (done כולל מה שנכשל), אחרת null. stopRequested() — האם נלחץ "עצור"
 * (או שיצאו מהמסך) מאז תחילת הריצה — לשלבים שלפני / בתוך ה-worker.
 *
 * @param {{ limit?: number, isFatal?: (error: any) => boolean }} [options]
 */
export function useBulkRun({ limit = 4, isFatal = isRequestFatal } = {}) {
  const [progress, setProgress] = useState(null)
  const [stopping, setStopping] = useState(false)
  const stopRef = useRef(false)
  // נפרד מ-stopRef: "עצור" מתאפס בריצה מרובה חדשה, יציאה מהמסך — לא (run שנקרא אחרי unmount לא שולח כלום)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    stopRef.current = false
    // יציאה מהמסך באמצע פעולה מרובה — לא שולחים עוד
    return () => {
      mountedRef.current = false
      stopRef.current = true
    }
  }, [])

  const run = useCallback(async (items, fn, { meta, showProgress = true, limit: runLimit = limit } = {}) => {
    const shouldStopOnUnmount = () => !mountedRef.current
    // פריט בודד (showProgress=false) — אולי באמצע ריצה מרובה על אותו מופע: לא נוגעים ב"עצור" וב-progress שלה,
    // ועוצרים רק ביציאה מהמסך.
    if (!showProgress) {
      return runLimited(items, fn, { limit: runLimit, shouldStop: shouldStopOnUnmount, isFatal })
    }
    if (!mountedRef.current) return runLimited(items, fn, { shouldStop: () => true })
    stopRef.current = false
    setStopping(false)
    const total = items.length
    setProgress({ ...meta, done: 0, total })
    try {
      return await runLimited(items, fn, {
        limit: runLimit,
        shouldStop: () => stopRef.current || shouldStopOnUnmount(),
        isFatal,
        onProgress: ({ done, failed }) => setProgress((p) => (p ? { ...p, done: done + failed } : p)),
      })
    } finally {
      if (mountedRef.current) {
        setProgress(null)
        setStopping(false)
      }
    }
  }, [limit, isFatal])

  const stop = useCallback(() => {
    stopRef.current = true
    setStopping(true)
  }, [])

  const stopRequested = useCallback(() => stopRef.current || !mountedRef.current, [])

  return { progress, stopping, stop, run, stopRequested }
}

/**
 * תוצאה של run בצורה שמסכי האימון קוראים: ok — הצליחו; failed — הפריטים שנכשלו; notAttempted — מה שלא נשלח;
 * lastError — הכשל הקטלני, או האחרון; stopped — לא כל הפריטים נשלחו (עצירה, כשל קטלני או יציאה מהמסך).
 * @template T
 * @param {{ done: T[], failed: { item: T, error: any }[], fatal: any, notAttempted: T[] }} result
 */
export function runSummary(result) {
  return {
    ok: result.done,
    failed: result.failed.map((f) => f.item),
    notAttempted: result.notAttempted,
    lastError: result.fatal || result.failed.at(-1)?.error || null,
    stopped: result.notAttempted.length > 0,
  }
}
