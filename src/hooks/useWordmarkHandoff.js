'use client'

import { useEffect } from 'react'
import { HANDOFF_STATE, handoffRootMargin, handoffState, handoffStateFromEntry } from '@/lib/wordmarkHandoff'

// useWordmarkHandoff — מחבר את שם האתר שבכותרת העליונה למילה "אוצריא" שבכותרת הראשית של
// הגיבור (דף הבית בלבד). הלוגו עצמו קבוע בכותרת; שם האתר מוצג רק כשהמילה בגיבור כבר נגללה
// אל מתחת לכותרת (הדפוס והנימוק — src/lib/wordmarkHandoff.js).
//
// המדידה: IntersectionObserver על המילה, עם rootMargin שמוריד מה-viewport את הרצועה שהכותרת
// מכסה — בלי מאזין גלילה ובלי עבודה בכל פריים. התוצאה נכתבת ל-<html data-wordmark-handoff>,
// והתנועה עצמה (transition קצר של opacity ו-transform) ב-animations.css. אותו קוד בכל הדפדפנים —
// אין תלות ב-animation-timeline (Firefox).
// גובה הכותרת נמדד מחדש כשהוא משתנה (ResizeObserver), ואז ה-observer נבנה מחדש.

export const WORDMARK_HANDOFF_SOURCE_ATTR = 'data-wordmark-handoff-source'
const STATE_ATTR = 'data-wordmark-handoff'

/**
 * @param {{ enabled: boolean, targetRef: import('react').RefObject<HTMLElement|null> }} params
 *   targetRef — שם האתר בכותרת (ממנו נמצאת הכותרת עצמה, <header>).
 */
export default function useWordmarkHandoff({ enabled, targetRef }) {
  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement
    const target = targetRef.current
    const source = document.querySelector(`[${WORDMARK_HANDOFF_SOURCE_ATTR}]`)
    const header = target?.closest('header')
    const setState = (state) => root.setAttribute(STATE_ATTR, state)
    const cleanup = () => root.removeAttribute(STATE_ATTR)

    // אין כותרת ראשית בדף (למשל שגיאה ברינדור הגיבור), או שאין כותרת/IntersectionObserver —
    // שם אתר רגיל, ולא מוסתר לתמיד
    if (!source || !header || typeof IntersectionObserver === 'undefined') {
      setState(HANDOFF_STATE.off)
      return cleanup
    }

    let observer = null
    let headerBottom = NaN
    const observe = () => {
      const bottom = header.getBoundingClientRect().bottom
      if (observer && bottom === headerBottom) return
      headerBottom = bottom
      observer?.disconnect()
      observer = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1]
        setState(handoffStateFromEntry({
          isIntersecting: entry.isIntersecting,
          sourceBottom: entry.boundingClientRect.bottom,
          rootTop: entry.rootBounds?.top
        }))
      }, { rootMargin: handoffRootMargin(headerBottom), threshold: 0 })
      observer.observe(source)
    }

    // המצב הראשון מיד (לפני הקריאה הראשונה של ה-observer), כדי שלא יהיה פריים בלי מצב
    setState(handoffState({ sourceBottom: source.getBoundingClientRect().bottom, headerBottom: header.getBoundingClientRect().bottom }))
    observe()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(observe)
    resizeObserver?.observe(header)
    window.addEventListener('resize', observe)

    return () => {
      observer?.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', observe)
      cleanup()
    }
  }, [enabled, targetRef])
}
