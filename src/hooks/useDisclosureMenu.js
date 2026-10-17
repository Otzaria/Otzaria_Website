'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * תפריט נפתח בדפוס disclosure (כפתור שפותח/סוגר פאנל, למשל תפריט הניווט בנייד):
 * - buttonProps — לפרוש על הכפתור: aria-expanded, aria-controls ו-onClick.
 * - panelProps — לפרוש על הפאנל: id (היעד של aria-controls) ו-ref.
 * - Esc סוגר (אם רכיב אחר לא טיפל בו — defaultPrevented), ומחזיר את הפוקוס לכפתור רק אם הפוקוס
 *   היה בתוך התפריט או על הכפתור; לחיצה מחוץ לכפתור ולפאנל סוגרת בלי להזיז פוקוס.
 * - close — לסגירה אחרי ניווט (onClick של קישור בפאנל).
 * - resetKey — ערך (למשל pathname) שכשהוא משתנה התפריט נסגר: גם בניווט שלא עבר דרך הפאנל
 *   (חזרה אחורה בדפדפן, קישור בתוכן העמוד).
 */
export function useDisclosureMenu(resetKey) {
  const [isOpen, setIsOpen] = useState(false)
  // סגירה בשינוי resetKey בזמן הרינדור (ולא ב-effect) — הדפוס של React ל"איפוס state כש-prop משתנה"
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey)
    setIsOpen(false)
  }
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const panelId = useId()

  const toggle = useCallback(() => setIsOpen(open => !open), [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    if (!isOpen) return undefined

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const active = document.activeElement
      const focusInside = panelRef.current?.contains(active) || buttonRef.current?.contains(active)
      setIsOpen(false)
      if (focusInside) buttonRef.current?.focus()
    }
    const onPointerDown = (event) => {
      const target = event.target
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setIsOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isOpen])

  return {
    isOpen,
    toggle,
    close,
    buttonProps: {
      ref: buttonRef,
      'aria-expanded': isOpen,
      'aria-controls': panelId,
      onClick: toggle,
    },
    panelProps: {
      id: panelId,
      ref: panelRef,
    },
  }
}
