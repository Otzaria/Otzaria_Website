'use client'

import { useCallback, useEffect, useRef } from 'react'
import { SENTINEL, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

const stay = () => Promise.resolve(true)

/** חלון "לעצור ולצאת?" — body אומר מה רץ ומה יקרה למה שעוד לא נשלח */
export const stopAndLeaveConfirm = (body) => ({ title: 'לעצור ולצאת?', body, confirmLabel: 'עצור וצא', cancelLabel: 'הישאר' })

/**
 * פעולה מרובה באמצע: יציאה מהמסך (קישור פנימי, "אחורה") שואלת "לעצור ולצאת?", ו"עצור וצא" עוצר אותה (מה שבאוויר
 * מסתיים, ואחריו לא נשלח עוד — useBulkRun עוצר גם ב-unmount). רענון / סגירת הלשונית — אזהרת הדפדפן.
 * pending — עוד משהו שממתין (למשל פעולה עם "בטל"): רק אזהרת הדפדפן, בלי לעצור מעבר בתוך האתר
 * (useDeferredActions שולח אותו ביציאה מהמסך).
 *
 * drawerOpen — מגירה בכתובת פתוחה (נפתחה ב-push, ונסגרת ב"אחורה" — useDrawerParam): בזמן שהיא פתוחה לא לוכדים
 * "אחורה" (הוא סוגר את המגירה, ולא שואל "לעצור ולצאת?"), ולא נדחפת רשומה כפולה על הכתובת של המגירה. רשומה כפולה
 * שנדחפה לפני פתיחת המגירה ונשארה מתחתיה כשהפעולה הסתיימה — מוסרת כשהמגירה נסגרת וחוזרים אליה.
 * מגירה שנפתחה מקישור ישיר (בלי push): "אחורה" בזמן ריצה יוצא בלי לשאול, והריצה נעצרת ב-unmount.
 *
 * @param {{ running: boolean, stop: () => void, confirm: (options: any) => Promise<boolean>, body: string, pending?: boolean,
 *   drawerOpen?: boolean }} options
 */
export function useBulkLeaveGuard({ running, stop, confirm, body, pending = false, drawerOpen = false }) {
  const confirmLeave = useCallback(async () => {
    const ok = await confirm(stopAndLeaveConfirm(body))
    if (ok) stop()
    return ok
  }, [confirm, stop, body])
  const trapBack = running && !drawerOpen
  useUnsavedChangesGuard(running || pending, running ? confirmLeave : stay, { trapBack, guardLinks: running })

  // רשומה כפולה שנשארה מתחת למגירה: נדחפה (trapBack), המגירה נפתחה מעליה, והפעולה הסתיימה בזמן שהמגירה פתוחה —
  // useUnsavedChangesGuard לא יכול להסיר אותה (היא לא העליונה). כשהמגירה נסגרת וחוזרים אליה — "אחורה" נוסף.
  const strandedRef = useRef(false)
  const drawerWasOpenRef = useRef(drawerOpen)
  useEffect(() => {
    const drawerClosed = drawerWasOpenRef.current && !drawerOpen
    drawerWasOpenRef.current = drawerOpen
    if (trapBack) {
      strandedRef.current = true
      return
    }
    // הפעולה הסתיימה כשהמגירה סגורה — useUnsavedChangesGuard הסיר את הרשומה בעצמו
    if (!drawerOpen && !drawerClosed) strandedRef.current = false
    if (!drawerClosed || running || !strandedRef.current) return
    strandedRef.current = false
    if (window.history.state?.[SENTINEL]) window.history.back()
  }, [trapBack, drawerOpen, running])
}
