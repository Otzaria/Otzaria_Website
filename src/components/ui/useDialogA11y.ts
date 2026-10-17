'use client'

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/**
 * התנהגות נגישה בסיסית של חלון מודאלי, בלי עיצוב:
 * - פוקוס עובר לחלון בפתיחה, ו"נלכד" בתוכו (Tab / Shift+Tab מסתובבים בין הפקדים שבו).
 * - Esc קורא ל-onEscape.
 * - גלילת הדף ברקע ננעלת (עם פיצוי על רוחב פס הגלילה, כדי שהדף לא "יקפוץ").
 * - בסגירה (unmount) הפוקוס חוזר לאלמנט שהיה ממוקד לפני הפתיחה — בדרך כלל הכפתור שפתח.
 *
 * panelRef צריך להצביע על אלמנט עם tabIndex={-1}, כדי שאפשר יהיה למקד אותו עצמו.
 */
export function useDialogA11y(panelRef: RefObject<HTMLElement | null>, onEscape: () => void) {
  // הפונקציה מתחלפת בכל רינדור; ref מונע הרשמה מחדש של המאזין בכל פעם
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const { body } = document
    const prevOverflow = body.style.overflow
    const prevPaddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`

    panel.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscapeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!panel.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPaddingRight
      opener?.focus({ preventScroll: true })
    }
  }, [panelRef])
}
