'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  'audio[controls]',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/** אלמנט מוסתר (hidden / inert / display:none / visibility:hidden) אינו בר-פוקוס, ולכן לא נספר בלכידת Tab */
export function isFocusableVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden],[inert]')) return false
  const style = window.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse'
}

/** מחסנית החלונות המודאליים הפתוחים. רק החלון העליון מגיב ל-Tab ול-Esc. */
const openPanels: HTMLElement[] = []
// הנעילה שייכת למחסנית כולה: חלון תחתון יכול להיעלם לפני חלון שמעליו.
let stackRestore: { overflow: string; paddingRight: string; paddingLeft: string; opener: HTMLElement | null } | null = null

/** האם panel הוא החלון המודאלי העליון כרגע (לבדיקות ולרכיבים שמאזינים למקלדת בעצמם) */
export function isTopDialog(panel: HTMLElement | null): boolean {
  return panel !== null && openPanels[openPanels.length - 1] === panel
}

export type DialogReturnFocus = HTMLElement | null | (() => HTMLElement | null | undefined)
type DialogA11yOptions = { escapeEnabled?: boolean; returnFocus?: DialogReturnFocus }

/**
 * התנהגות נגישה בסיסית של חלון מודאלי, בלי עיצוב. תומך ב-Escape אופציונלי, חלונות מקוננים,
 * נעילת גלילה עם scrollbar-gutter ו-RTL, ושחזור פוקוס ל-opener או ל-returnFocus.
 */
export function useDialogA11y(
  panelRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
  options: boolean | DialogA11yOptions = true
) {
  const escapeEnabled = typeof options === 'boolean' ? options : options.escapeEnabled ?? true
  const returnFocus = typeof options === 'boolean' ? undefined : options.returnFocus
  const onEscapeRef = useRef(onEscape)
  const escapeEnabledRef = useRef(escapeEnabled)
  const returnFocusRef = useRef(returnFocus)
  useEffect(() => {
    onEscapeRef.current = onEscape
    escapeEnabledRef.current = escapeEnabled
    returnFocusRef.current = returnFocus
  })

  // ה-opener נלכד בזמן הרינדור הראשון — לפני ה-commit, שבו autoFocus של ילד עלול לגנוב את הפוקוס
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null
  )

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const { body } = document
    if (openPanels.length === 0) {
      stackRestore = { overflow: body.style.overflow, paddingRight: body.style.paddingRight, paddingLeft: body.style.paddingLeft, opener }
      const root = document.documentElement
      const scrollbarWidth = window.innerWidth - root.clientWidth
      const hasGutter = window.getComputedStyle(root).getPropertyValue('scrollbar-gutter').includes('stable')
      const rtl = window.getComputedStyle(body).direction === 'rtl'
      body.style.overflow = 'hidden'
      if (scrollbarWidth > 0 && !hasGutter) {
        if (rtl) body.style.paddingLeft = `${scrollbarWidth}px`
        else body.style.paddingRight = `${scrollbarWidth}px`
      }
    }

    openPanels.push(panel)
    // יעד פוקוס מפורש (data-autofocus — למשל "ביטול" בדיאלוג הרסני) קודם לכול: autoFocus של React
    // בתוך פורטל לא תמיד תופס בדפדפן. אחרת — ילד שכבר ממוקד (autoFocus) לא נדרס, ובלעדיו החלון.
    const preferred = panel.querySelector<HTMLElement>('[data-autofocus]')
    if (preferred) preferred.focus({ preventScroll: true })
    else if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(panel)) return
      if (event.key === 'Escape') {
        // חלון שאינו dismissible אינו בולע Escape; רכיב פנימי שטיפל במקש מונע סגירת החלון.
        if (!escapeEnabledRef.current || event.defaultPrevented) return
        event.preventDefault()
        onEscapeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isFocusableVisible)
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
      const wasTop = isTopDialog(panel)
      const index = openPanels.lastIndexOf(panel)
      if (index !== -1) openPanels.splice(index, 1)
      const remaining = openPanels[openPanels.length - 1]
      const restore = stackRestore
      if (!remaining && restore) {
        body.style.overflow = restore.overflow
        body.style.paddingRight = restore.paddingRight
        body.style.paddingLeft = restore.paddingLeft
        stackRestore = null
      }
      // הסרת חלון ברקע אינה משנה את הפוקוס בחלון העליון.
      if (!wasTop) return
      const target = typeof returnFocusRef.current === 'function' ? returnFocusRef.current() : returnFocusRef.current
      const preferred = target ?? opener
      if (remaining) {
        ;(preferred?.isConnected && remaining.contains(preferred) ? preferred : remaining).focus({ preventScroll: true })
      } else {
        ;(preferred?.isConnected ? preferred : restore?.opener)?.focus({ preventScroll: true })
      }
    }
  }, [panelRef, opener])
}
