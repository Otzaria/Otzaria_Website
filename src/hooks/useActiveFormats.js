'use client'

import { useEffect, useState } from 'react'
import { activeFormats } from '@/lib/editor/formatToggle'
import { isEditorField } from '@/lib/editor/editorField'

const NONE = Object.freeze({ b: false, i: false, u: false, big: false, small: false, h1: false, h2: false, h3: false })
const same = (a, b) => Object.keys(NONE).every((k) => a[k] === b[k])

/**
 * אילו עיצובים חלים על הבחירה/הסמן בשדה הפעיל של העורך (textarea או התצוגה המעוצבת) — למצב
 * "לחוץ" של כפתורי שורת הכלים (B/I/U, כותרות, big/small). כמו useCaretPosition: מאזינים ב-capture
 * על document, והחישוב נדחה ל-requestAnimationFrame (לא בתוך האירוע — ראו שם למה).
 * כשהפוקוס יוצא מהשדה (לחיצה על כפתור עם keepFocus לא מוציאה אותו) — המצב האחרון נשמר.
 *
 * @param {string} [scope='.editor-container']
 * @returns {typeof NONE}
 */
export function useActiveFormats(scope = '.editor-container') {
  const [formats, setFormats] = useState(NONE)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = document.activeElement
      if (!isEditorField(el) || !el.closest(scope)) return
      const next = activeFormats(el.value, el.selectionStart, el.selectionEnd)
      setFormats((prev) => (same(prev, next) ? prev : next))
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const events = ['selectionchange', 'keyup', 'mouseup', 'input', 'focusin']
    events.forEach((name) => document.addEventListener(name, schedule, true))
    return () => {
      events.forEach((name) => document.removeEventListener(name, schedule, true))
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scope])
  return formats
}

export default useActiveFormats
