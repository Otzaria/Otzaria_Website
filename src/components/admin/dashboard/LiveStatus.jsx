'use client'

import { useEffect } from 'react'

const REGION_ID = 'dashboard-live-status'

/**
 * אזור הכרזה קבוע לקורא המסך. הוא בעמוד מחוץ ל-Suspense — כך הוא קיים לפני שהתוכן מגיע, ושינוי
 * הטקסט שלו מוכרז. (role="status" על תוכן שמחליף שלד לא מוכרז: הוא אלמנט חדש, לא שינוי.)
 */
export function LiveRegion() {
  return <p id={REGION_ID} role="status" aria-live="polite" className="sr-only" />
}

/**
 * מכריז message כשהתוכן מגיע — בטעינה, ושוב אחרי כל "נסה שוב" (stamp משתנה בכל רינדור בשרת,
 * כך שגם כשהתוצאה זהה המשתמש שומע שהטעינה הסתיימה).
 */
export function Announce({ message, stamp }) {
  useEffect(() => {
    const region = document.getElementById(REGION_ID)
    if (!region || !message) return undefined
    region.textContent = ''
    const timer = setTimeout(() => { region.textContent = message }, 100)
    return () => clearTimeout(timer)
  }, [message, stamp])
  return null
}
