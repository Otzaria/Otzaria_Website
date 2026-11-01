'use client'

import { useEffect, useState } from 'react'
import { caretPosition } from '@/components/editor/v2/editorShellLogic'
import { isEditorField } from '@/lib/editor/editorField'

/**
 * מיקום הסמן ב-textarea הפעיל של העורך (שורה/מילה) — לשורת המצב.
 *
 * העדכון נדחה ל-requestAnimationFrame ולא מתבצע בתוך האירוע עצמו: המאזינים יושבים ב-capture
 * על document, כלומר רצים *לפני* המאזין של React. setState שם מתזמן render ב-microtask, והדפדפן
 * מריץ microtasks בין מאזין למאזין — ה-render רץ לפני ש-onChange של ה-textarea קרא את הערך החדש,
 * מחזיר לו את הערך הישן (controlled) ו-onChange לא נקרא כלל. כך Enter (ששינה שורה → state חדש)
 * "נבלע" והסמן קפץ לסוף הטקסט.
 *
 * @param {string} [scope='.editor-container'] רק textarea בתוך אלמנט שתואם ל-selector הזה
 * @returns {{ line: number, word: number, totalLines: number, pageWord: number, totalWords: number } | null}
 */
export function useCaretPosition(scope = '.editor-container') {
  const [caretPos, setCaretPos] = useState(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = document.activeElement
      if (!isEditorField(el) || !el.closest(scope)) return
      const next = caretPosition(el.value, el.selectionStart)
      setCaretPos(prev => (prev && prev.line === next.line && prev.word === next.word && prev.totalLines === next.totalLines &&
        prev.pageWord === next.pageWord && prev.totalWords === next.totalWords ? prev : next))
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const events = ['selectionchange', 'keyup', 'mouseup', 'input']
    events.forEach(name => document.addEventListener(name, schedule, true))
    return () => {
      events.forEach(name => document.removeEventListener(name, schedule, true))
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scope])
  return caretPos
}

export default useCaretPosition
