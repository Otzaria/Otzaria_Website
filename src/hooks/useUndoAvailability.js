import { useEffect, useRef, useState } from 'react'
import { isEditorField, queryEditorField } from '@/lib/editor/editorField'
import { editorFieldHistory, installTextareaHistory } from '@/components/editor/v2/textareaHistory'

const NONE = Object.freeze({ canUndo: false, canRedo: false })

/**
 * האם יש מה לבטל/לבצע מחדש בשדה הפעיל של העורך (בתוך containerRef) — לפי עומק ההיסטוריה שהשדה
 * עצמו מדווח: בתצוגה המעוצבת — richHistory (richController), בתצוגת הקוד — המחסנית של
 * textareaHistory.js, שהוק זה גם מתקין (במקום ההיסטוריה המובנית של הדפדפן, שאי אפשר לשאול
 * ושמבטלת תו-אחר-תו). כך "מושבת" מדויק: אחרי ביטול של הכל ואחרי טעינה. ההיסטוריה שייכת לשדה
 * הלוגי (fieldHistoryStore) — מעבר תצוגה לא מוחק אותה.
 *
 * השדה הפעיל: הממוקד בתוך המכל, ואם אין — האחרון שהיה ממוקד, ואם אין — הראשי.
 *
 * העדכון נדחה ל-requestAnimationFrame ולא מתבצע בתוך האירוע: המאזינים יושבים ב-capture על
 * document, כלומר רצים *לפני* המאזין של React. setState שם מתזמן render ב-microtask, שרץ בין
 * מאזין למאזין — ה-render מחזיר ל-textarea (controlled) את הערך הישן לפני ש-onChange קרא את החדש,
 * ו-onChange לא נקרא כלל (עריכה "נבלעת" והסמן קופץ לסוף).
 *
 * @param {{ current: HTMLElement | null }} containerRef
 * @param {unknown} resetKey — שינוי בו (מעבר עמוד, טעינה, פיצול, מעבר תצוגה) מחשב מחדש
 * @returns {{ canUndo: boolean, canRedo: boolean }}
 */
export function useUndoAvailability(containerRef, resetKey) {
  const [state, setState] = useState(NONE)
  const lastFieldRef = useRef(/** @type {Element|null} */ (null))
  const scheduleRef = useRef(() => {})

  useEffect(() => {
    let raf = 0
    const activeField = () => {
      const container = containerRef.current
      if (!container) return null
      const focused = document.activeElement
      if (isEditorField(focused) && container.contains(focused)) return focused
      const last = lastFieldRef.current
      if (last && last.isConnected && container.contains(last)) return last
      return queryEditorField(container)
    }
    const flush = () => {
      raf = 0
      const h = editorFieldHistory(activeField())
      const next = h ? { canUndo: h.canUndo(), canRedo: h.canRedo() } : NONE
      setState((prev) => (prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next))
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(flush)
    }
    scheduleRef.current = schedule

    const onEvent = (e) => {
      const t = e.target
      if (!isEditorField(t) || !containerRef.current?.contains(t)) return
      if (e.type === 'focusin') lastFieldRef.current = t
      schedule()
    }
    const uninstall = installTextareaHistory(document, () => containerRef.current)
    document.addEventListener('input', onEvent, true)
    document.addEventListener('focusin', onEvent, true)
    schedule()
    return () => {
      uninstall()
      document.removeEventListener('input', onEvent, true)
      document.removeEventListener('focusin', onEvent, true)
      if (raf) cancelAnimationFrame(raf)
      scheduleRef.current = () => {}
    }
  }, [containerRef])

  // אחרי כל render של המארח (ובמיוחד שינוי resetKey) — השדות אולי הוחלפו או קיבלו ערך מבחוץ
  useEffect(() => {
    scheduleRef.current()
  })
  useEffect(() => {
    lastFieldRef.current = null
    scheduleRef.current()
  }, [resetKey])

  return state
}
