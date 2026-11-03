'use client'

import { useEffect, useRef, useState } from 'react'

// המקלדת בסקירה (זיהוי ונתב), כמו במסכי המתנדבים: ↑↓ בין השורות, ושאר המקשים ←
// onKey(key, item) של המסך (מחזיר true כשטיפל). אחרי פעולה הרשימה נטענת מחדש והשורה
// שאושרה יוצאת ממנה — השורה הבאה תופסת את מקומה, ולכן "השורה הנוכחית" נשמרת לפי
// המקום ברשימה ולא לפי המזהה: אין קפיצה, רק גלילה רכה עד שהשורה כולה נראית.
// לא פועל בזמן הקלדה בשדה (חוץ מתיבת-סימון), כשחלון פתוח, או עם Ctrl/Alt.

const smooth = () => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

export function isTyping(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'INPUT') return !['checkbox', 'radio', 'button', 'submit'].includes(el.type)
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

export function useRowKeys(items, onKey) {
  const [cur, setCur] = useState(0)
  const at = Math.max(0, Math.min(cur, items.length - 1))
  const item = items[at]
  const scroll = useRef(false)

  useEffect(() => {
    if (!scroll.current || !item) return
    scroll.current = false
    document.querySelector(`[data-item="${item.id}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: smooth() })
  }, [item])

  useEffect(() => {
    const onDown = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (document.querySelector('[role="dialog"]') || !items.length) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        scroll.current = true
        setCur(Math.max(0, Math.min(items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1))))
        return
      }
      // Enter על כפתור שבפוקוס — הכפתור עצמו פועל
      if (e.key === 'Enter' && ['BUTTON', 'A'].includes(e.target?.tagName)) return
      if (onKey(e.key, items[at])) {
        e.preventDefault()
        scroll.current = true
      }
    }
    window.addEventListener('keydown', onDown)
    return () => window.removeEventListener('keydown', onDown)
  })

  return { cur: at, setCur }
}

// הידית שכל שורה רושמת (useImperativeHandle) — כדי שהמקלדת תפעיל את מה שבתוך השורה
export function useHandles() {
  const map = useRef(new Map())
  return {
    get: (id) => map.current.get(id),
    ref: (id) => (h) => {
      if (h) map.current.set(id, h)
      else map.current.delete(id)
    },
  }
}
