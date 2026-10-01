'use client'

import { useState, useEffect, useRef } from 'react'

// כל 3 דקות במקום כל 40 שניות. הבדיקה נועדה לתפוס דפלוי חדש, ולא צריכה להיות
// צמודה יותר מזה — היא רצה בכל טאב פתוח של כל משתמש.
const CHECK_INTERVAL_MS = 3 * 60_000

// הזוג "גרסה רצה|גרסה בשרת" שעליו כבר הוצגה ההודעה בטאב הזה (sessionStorage).
// כש-public/version.json חדש מהגרסה שרצה בפועל (build שנכשל אחרי
// generate-version, או חלון ה-build עצמו), רענון לא משנה את הגרסה שרצה — ובלי
// זה ההודעה הייתה חוזרת אחרי כל רענון. אותו זוג בטאב אחרי רענון = לא להציג שוב.
const SHOWN_STORAGE_KEY = 'otzaria:version-notice-shown'

function readShownPair() {
  try {
    return window.sessionStorage.getItem(SHOWN_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeShownPair(pair) {
  try {
    window.sessionStorage.setItem(SHOWN_STORAGE_KEY, pair)
  } catch {
    // sessionStorage חסום — ההודעה פשוט עשויה לחזור אחרי רענון
  }
}

async function fetchVersion() {
  // no-store במקום ?t=Date.now(): אותה תוצאה בלי לייצר URL חדש בכל בקשה
  // (URL ייחודי מנטרל גם את מטמון ה-CDN וגם מזהם לוגים).
  const res = await fetch('/version.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return String((await res.json()).version)
}

/**
 * @param {{ deployVersion?: string }} props
 *   deployVersion — חותם הגרסה שאיתו נבנה הדף (נקרא מ-public/version.json בזמן
 *   ה-build, ראו next.config.ts). כשהוא ידוע אין צורך לשאול את השרת בעליית
 *   הדף מהי הגרסה ההתחלתית — בקשה אחת פחות בכל טעינת דף. בלעדיו (למשל ב-dev
 *   לפני generate-version) ההתנהגות הקודמת: הבדיקה הראשונה קובעת את הבסיס.
 */
export default function VersionNotice({ deployVersion }) {
  const [hasUpdate, setHasUpdate] = useState(false)
  // הגרסה שאיתה נטענה האפליקציה. ב-ref ולא ב-state: הקומפוננטה אינה מציגה
  // אותה, וכ-state היא הייתה תלות של ה-useEffect וגורמת לבקשה כפולה בעלייה
  // ולבנייה מחדש של ה-interval.
  const initialVersion = useRef(deployVersion ? String(deployVersion) : null)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      // אין טעם לבדוק כשהטאב ברקע — נבדוק כשהמשתמש יחזור אליו.
      if (document.visibilityState !== 'visible') return
      try {
        const version = await fetchVersion()
        if (cancelled) return
        if (initialVersion.current === null) initialVersion.current = version
        else if (version !== initialVersion.current) {
          const pair = `${initialVersion.current}|${version}`
          if (readShownPair() === pair) return
          writeShownPair(pair)
          setHasUpdate(true)
        }
      } catch {
        // התעלמות משגיאות רשת זמניות
      }
    }

    // בלי גרסת build ידועה — הבדיקה המיידית קובעת את הבסיס (כמו קודם)
    if (initialVersion.current === null) check()
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

  // אנימציית CSS ולא framer-motion: הקומפוננטה יושבת במעטפת השורש, ולכן ייבוא
  // של framer-motion כאן נכנס לחבילת ה-JavaScript של *כל* דף באתר.
  return (
    <>
      {hasUpdate && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-md w-full animate-enter-toast">
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
        </div>
      )}
    </>
  )
}
