'use client'

import { useCallback, useState } from 'react'
import { isEditorField, queryEditorField } from '@/lib/editor/editorField'
import { fieldColumn, reportTarget } from './reportLogic'

/**
 * המצב של תפריט הלחיצה הימנית ושל חלונות הדיווח בעורך העמוד. ה-UI עצמו — PageReportsLayer.
 *
 * onFieldContextMenu — מועבר ל-TextEditor (onFieldContextMenu). Shift + לחצן ימני ולחיצה ארוכה
 * במגע — התפריט הרגיל של הדפדפן (לא נוגעים באירוע).
 * openErrorReport / openPageMessage — נקודות כניסה נוספות (חלון הפקודות).
 *
 * @param {{ containerRef: { current: HTMLElement | null }, activeColumn?: 'right'|'left'|null }} input
 */
export function usePageReports({ containerRef, activeColumn = null }) {
  const [menu, setMenu] = useState(/** @type {null | MenuState} */ (null))
  const [dialog, setDialog] = useState(/** @type {null | DialogState} */ (null))

  /** שדה הטור (right / left / content) בתוך העורך */
  const fieldFor = useCallback((column) => {
    const root = containerRef.current || (typeof document !== 'undefined' ? document.querySelector('.editor-container') : null)
    return queryEditorField(root, column === 'right' || column === 'left' ? column : null)
  }, [containerRef])

  /** פוקוס חזרה לשדה, עם הבחירה */
  const focusField = useCallback((column, start, end) => {
    const el = fieldFor(column)
    if (!el) return null
    el.focus({ preventScroll: true })
    if (Number.isInteger(start) && Number.isInteger(end)) el.setSelectionRange(start, end)
    return el
  }, [fieldFor])

  const onFieldContextMenu = useCallback((event, field) => {
    const native = event.nativeEvent || event
    if (native.pointerType === 'touch') return
    // מקלדת (מקש התפריט / Shift+F10) — לפעמים בלי קואורדינטות. Shift + לחצן ימני (button 2 בלבד)
    // — התפריט של הדפדפן; ב-Shift+F10 גם shiftKey דלוק, אבל זה לא לחצן העכבר, ולכן התפריט שלנו נפתח
    const fromKeyboard = event.clientX === 0 && event.clientY === 0
    if (event.shiftKey && native.button === 2) return
    event.preventDefault()
    let x = event.clientX
    let y = event.clientY
    if (fromKeyboard) {
      const rect = field.getBoundingClientRect()
      x = rect.right - 24
      y = rect.top + 24
    }
    setMenu({
      x,
      y,
      column: fieldColumn(field.getAttribute('data-column')),
      value: field.value ?? '',
      start: field.selectionStart ?? 0,
      end: field.selectionEnd ?? 0,
    })
  }, [])

  // הפוקוס חוזר מיד (לא אחרי רינדור): בבחירת פריט ContextMenu קורא ל-onClose ואז לפעולה,
  // והפעולה מצפה שהפוקוס והבחירה כבר בשדה. לחיצה בחוץ — הלחיצה עצמה קובעת לאן הפוקוס הולך.
  const closeMenu = useCallback((reason) => {
    if (menu && reason !== 'outside') focusField(menu.column, menu.start, menu.end)
    setMenu(null)
  }, [menu, focusField])

  // פתיחת חלון הדיווח: מסמנים בשדה את מה שידווח (שהמשתמש יראה), והחלון נפתח כשהפוקוס בשדה —
  // כך שבסגירה הוא חוזר אליו
  const openErrorFor = useCallback((column, value, start, end) => {
    const target = reportTarget(value, start, end)
    focusField(column, target.start, target.end)
    setDialog({ kind: 'error', column, value, start: target.start, end: target.end, text: target.text })
  }, [focusField])

  /** מהתפריט — לפי מה שנתפס בלחיצה */
  const openErrorFromMenu = useCallback((m) => openErrorFor(m.column, m.value, m.start, m.end), [openErrorFor])

  /** מחלון הפקודות — השדה הממוקד, ואם אין — הטור הפעיל */
  const openErrorReport = useCallback(() => {
    const active = typeof document !== 'undefined' ? document.activeElement : null
    const el = isEditorField(active) ? /** @type {any} */ (active) : fieldFor(activeColumn)
    if (!el) return
    openErrorFor(fieldColumn(el.getAttribute('data-column')), el.value ?? '', el.selectionStart ?? 0, el.selectionEnd ?? 0)
  }, [fieldFor, activeColumn, openErrorFor])

  const openPageMessage = useCallback(() => setDialog({ kind: 'message' }), [])
  const closeDialog = useCallback(() => setDialog(null), [])

  return {
    onFieldContextMenu,
    openErrorReport,
    openPageMessage,
    layerProps: { menu, dialog, closeMenu, closeDialog, openErrorFromMenu, openPageMessage, fieldFor, focusField },
  }
}

/**
 * @typedef {{ x: number, y: number, column: 'right'|'left'|'content', value: string, start: number, end: number }} MenuState
 * @typedef {{ kind: 'error', column: 'right'|'left'|'content', value: string, start: number, end: number, text: string } | { kind: 'message' }} DialogState
 */
