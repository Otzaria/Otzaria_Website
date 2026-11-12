'use client'

import { useEffect, type RefObject } from 'react'

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NEXT-ROUTE-ANNOUNCER'])

/**
 * בזמן שחלון מודאלי בפורטל ל-body פתוח — כל שאר ילדי ה-body מקבלים inert: אי אפשר להגיע
 * אליהם בפוקוס, בלחיצה או בקורא מסך (גם בקוראים שמתעלמים מ-aria-modal, כמו VoiceOver ב-iOS
 * בחלק מהגרסאות). ילד שכבר היה inert לפני כן נשאר כמו שהוא בסגירה.
 *
 * סדר: להפעיל לפני useDialogA11y באותו רכיב — ה-cleanup כאן רץ קודם, כך שהרקע משתחרר לפני
 * שהפוקוס חוזר לכפתור שפתח (אלמנט inert לא מקבל פוקוס).
 */
export function useInertBackground(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const changed: HTMLElement[] = []
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement) || child === root || child.contains(root) || child.hasAttribute('inert')) continue
      // רכיבים שלא מוצגים, ומכריז המעבר של Next (אזור חי — חייב להישאר נגיש)
      if (SKIP_TAGS.has(child.tagName)) continue
      child.setAttribute('inert', '')
      changed.push(child)
    }
    return () => {
      for (const child of changed) child.removeAttribute('inert')
    }
  }, [rootRef])
}
