'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'
import { neighborAfterRemove } from '@/lib/adminList/selection'

/**
 * פוקוס אחרי ששורה יוצאת מרשימת ניהול (מחיקה, אישור, יציאה מהסינון) — לשורה שבאה במקומה, ולא לתחילת הדף, כדי
 * שאפשר להמשיך במקלדת. שלוש דרכים להפעיל, אחת לכל סוג מסך:
 *
 *   onListFocus (על הרשימה, עם listRef) — בלי שהקורא יודע מה יצא: נרשם האלמנט שבו הפוקוס ומקומו. כשהוא יוצא
 *     מהדף והפוקוס אבד — לשורה שבאותו מקום (או האחרונה), וכשאין שורות — ל-fallbackId. (ספרים, העלאות)
 *   beforeRemove(ids) — הקורא אומר מה עומד לצאת, מיד לפני ההסרה: אחרי שהשורות יצאו, אם הפוקוס אבד — לשורה
 *     הבאה (או לקודמת, אם יצאה האחרונה), וכשאין — ל-fallbackId (בלי — לשום מקום). (מסכי האימון)
 *     always — גם אם הפוקוס לא אבד (למשל חלון שנסגר ומחזיר אותו לשורה שנמחקה), בתור הבא (setTimeout). (משתמשים)
 *   focusAfterRender(id) — לשורה הזו אחרי הרינדור הבא (למשל שורה שחזרה ב"בטל").
 *
 * יעד הפוקוס בשורה: focusIn (בורר בתוך השורה), או השורה עצמה (focusIn=null).
 *
 * @param {{ rowAttr?: string, focusIn?: string | null, fallbackId?: string | null, rootId?: string | null, preventScroll?: boolean }} [options]
 *   rowAttr — המאפיין שמסמן שורה, וערכו מזהה הפריט (ברירת מחדל data-row). השורות — הילדים הישירים של listRef;
 *   בלי listRef — בתוך rootId, או בכל הדף.
 */
export function useFocusAfterRemove({ rowAttr = 'data-row', focusIn = null, fallbackId = null, rootId = null, preventScroll = false } = {}) {
  const listRef = useRef(null)
  const lastFocus = useRef(null) // { el, index } — onListFocus
  const pending = useRef(null) // { removed: Set, next } — beforeRemove
  const restore = useRef(null) // id — focusAfterRender

  const rows = useCallback(() => {
    const list = listRef.current
    if (list) return [...list.querySelectorAll(`:scope > [${rowAttr}]`)]
    const root = rootId ? document.getElementById(rootId) : document
    return root ? [...root.querySelectorAll(`[${rowAttr}]`)] : []
  }, [rowAttr, rootId])

  const targetIn = useCallback((row) => (row ? (focusIn ? row.querySelector(focusIn) : row) : null), [focusIn])
  const rowOf = useCallback((id) => (id == null ? null : rows().find((r) => r.getAttribute(rowAttr) === String(id)) || null), [rows, rowAttr])
  const focus = useCallback((el) => {
    const target = el || (fallbackId ? document.getElementById(fallbackId) : null)
    target?.focus(preventScroll ? { preventScroll: true } : undefined)
  }, [fallbackId, preventScroll])

  const onListFocus = useCallback((event) => {
    const row = event.target.closest?.(`[${rowAttr}]`)
    if (!row || !listRef.current) return
    lastFocus.current = { el: event.target, index: rows().indexOf(row) }
  }, [rowAttr, rows])

  const beforeRemove = useCallback((ids, { always = false } = {}) => {
    const removed = new Set(ids.map(String))
    if (removed.size === 0) return
    const next = neighborAfterRemove(rows().map((r) => r.getAttribute(rowAttr)), removed)
    if (always) {
      setTimeout(() => focus(targetIn(rowOf(next))), 0)
      return
    }
    pending.current = { removed, next }
  }, [rows, rowAttr, focus, targetIn, rowOf])

  const focusAfterRender = useCallback((id) => { restore.current = id }, [])

  useLayoutEffect(() => {
    const lost = () => {
      const active = document.activeElement
      return !active || active === document.body || !active.isConnected
    }

    if (restore.current != null) {
      const id = restore.current
      restore.current = null
      focus(targetIn(rowOf(id)))
      return
    }

    const p = pending.current
    if (p && !rows().some((r) => p.removed.has(r.getAttribute(rowAttr)))) {
      pending.current = null
      if (lost()) {
        const row = rowOf(p.next)
        if (row || fallbackId) focus(targetIn(row))
      }
    }

    const last = lastFocus.current
    if (!last || last.el.isConnected || !lost()) return
    lastFocus.current = null
    const list = rows()
    focus(targetIn(list[Math.min(last.index, list.length - 1)]))
  })

  return { listRef, onListFocus, beforeRemove, focusAfterRender }
}
