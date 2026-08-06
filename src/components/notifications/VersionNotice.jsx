'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// כל 3 דקות במקום כל 40 שניות. הבדיקה נועדה לתפוס דפלוי חדש, ולא צריכה להיות
// צמודה יותר מזה — היא רצה בכל טאב פתוח של כל משתמש.
const CHECK_INTERVAL_MS = 3 * 60_000

async function fetchVersion() {
  // no-store במקום ?t=Date.now(): אותה תוצאה בלי לייצר URL חדש בכל בקשה
  // (URL ייחודי מנטרל גם את מטמון ה-CDN וגם מזהם לוגים).
  const res = await fetch('/version.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()).version
}

export default function VersionNotice() {
  const [hasUpdate, setHasUpdate] = useState(false)
  // הגרסה שאיתה נטענה האפליקציה. ב-ref ולא ב-state: הקומפוננטה אינה מציגה
  // אותה, וכ-state היא הייתה תלות של ה-useEffect וגורמת לבקשה כפולה בעלייה
  // ולבנייה מחדש של ה-interval.
  const initialVersion = useRef(null)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      // אין טעם לבדוק כשהטאב ברקע — נבדוק כשהמשתמש יחזור אליו.
      if (document.visibilityState !== 'visible') return
      try {
        const version = await fetchVersion()
        if (cancelled) return
        if (initialVersion.current === null) initialVersion.current = version
        else if (version !== initialVersion.current) setHasUpdate(true)
      } catch {
        // התעלמות משגיאות רשת זמניות
      }
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', check)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <AnimatePresence>
      {hasUpdate && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 right-6 z-[100] max-w-md w-full"
        >
          <div className="bg-neutral-cool-900/95 text-white p-4 rounded-xl shadow-2xl backdrop-blur-md border border-neutral-cool-700 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <span className="material-symbols-outlined text-primary animate-pulse">
                  system_update
                </span>
              </div>
              <div>
                <h4 className="font-bold text-sm">האתר עודכן!</h4>
                <p className="text-xs text-neutral-cool-400">יש לרענן כדי לטעון את התוכן המעודכן</p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap shadow-lg"
            >
              רענן עכשיו
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
