'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * סידור רשימה במקלדת: אחרי כל הזזה הפוקוס נשאר על אותו תוסף, וקורא המסך שומע את המקום החדש.
 *
 * announce(text, target) אחרי שהרשימה התעדכנה. text — נכנס לאזור role="status". target — לאן הפוקוס:
 *   { id, control, fallback } — השורה (data-reorder-row) והכפתור בה (data-reorder). בקצה הרשימה החץ מושבת,
 *   ולכן fallback — הכפתור שנשאר (למשל החץ ההפוך). אחרי "הסר": id של השורה הסמוכה. בלי שורה — rootRef.
 *
 * @returns {{ rootRef: import('react').RefObject<HTMLElement>, notice: string,
 *   announce: (text: string, target: { id?: string, control?: string, fallback?: string }) => void }}
 */
export function useReorderFocus() {
  const rootRef = useRef(null)
  const [state, setState] = useState({ notice: '', target: null })

  useEffect(() => {
    const { target } = state
    if (!target) return
    const root = rootRef.current
    const row = target.id ? root?.querySelector(`[data-reorder-row="${CSS.escape(target.id)}"]`) : null
    const buttons = [target.control, target.fallback].filter(Boolean).map((name) => row?.querySelector(`[data-reorder="${name}"]`))
    const button = buttons.find((el) => el && !el.disabled)
    ;(button || root)?.focus({ preventScroll: Boolean(button) })
  }, [state])

  return { rootRef, notice: state.notice, announce: (notice, target) => setState({ notice, target }) }
}
