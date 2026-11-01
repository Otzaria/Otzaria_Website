'use client'

import { useCallback, useEffect, useRef } from 'react'
import { isEditorField, queryEditorField, richFieldApi } from '@/lib/editor/editorField'

/**
 * מעבר בין התצוגה המעוצבת לתצוגת הקוד (העדפה textView) — בלי לאבד את מקום הסמן: ההיסט
 * במחרוזת (זהה בשתי התצוגות) נקרא מהשדה הנוכחי לפני המעבר ומוצב בשדה החדש אחרי שעלה.
 *
 * @param {{ setPrefs: (patch: object | ((p: any) => object)) => void, activeColumn?: 'right'|'left'|null,
 *   scope?: string }} p
 * @returns {() => void}
 */
export function useTextViewToggle({ setPrefs, activeColumn = null, scope = '.editor-container' }) {
  // ה-rAF הכפול שממתין (מזהה הפריים הנוכחי) — מבוטל ב-unmount ובמעבר נוסף לפני שהסתיים
  const rafRef = useRef(0)
  const cancel = () => {
    if (rafRef.current && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
  }
  useEffect(() => cancel, [])

  return useCallback(() => {
    const root = typeof document === 'undefined' ? null : document.querySelector(scope)
    const active = typeof document === 'undefined' ? null : document.activeElement
    const el = isEditorField(active) && root?.contains(active)
      ? /** @type {HTMLTextAreaElement} */ (active)
      : /** @type {HTMLTextAreaElement|null} */ (queryEditorField(root, activeColumn))
    const snap = el
      ? { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0, focused: active === el, column: el.getAttribute('data-column') }
      : null
    setPrefs((p) => ({ textView: p.textView === 'code' ? 'rich' : 'code' }))
    cancel()
    if (!snap || typeof requestAnimationFrame === 'undefined') return
    // שני פריימים: אחרי ה-render ואחרי שהשדה החדש התקין את עצמו
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        const next = /** @type {HTMLTextAreaElement|null} */ (queryEditorField(document.querySelector(scope), /** @type {any} */ (snap.column)))
        if (!next || next === el) return
        next.setSelectionRange(snap.start, snap.end)
        if (!snap.focused) return
        next.focus()
        // השדה המעוצב גולל אל הסמן כשהוא ממוקד; ה-textarea — הדפדפן גולל בפוקוס
        if (richFieldApi(next)) next.setSelectionRange(snap.start, snap.end)
      })
    })
  }, [setPrefs, activeColumn, scope])
}

export default useTextViewToggle
