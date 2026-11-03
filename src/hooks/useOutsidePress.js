'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * סגירה בלחיצה מחוץ לפאנל לא-מודאלי (גיליון, חלונית צפה).
 *
 * "בתוך" נקבע לפי עץ React ולא לפי ה-DOM: מחזירים onPointerDownCapture לפרוש על הפאנל, ו-React
 * מעביר אליו גם לחיצות בתוך פורטלים שהפאנל פתח (בורר גופנים, Tooltip) — למרות שב-DOM הם מחוץ לו.
 * מאזין ב-document (בשלב ה-bubble, אחרי React) מחליט: אם הלחיצה לא סומנה כ"בתוך" ואינה
 * ב-ignore — onOutside(event).
 *
 * הלחיצה לא נבלעת (אין preventDefault/stopPropagation): לחיצה על הטקסט עדיין מציבה בו את הסמן.
 *
 * @param {boolean} enabled
 * @param {(event: PointerEvent) => void} onOutside
 * @param {{ ignore?: (target: Element) => boolean }} [options] ignore — לחיצות שלא נחשבות "בחוץ"
 *   (למשל כפתור המתג שפתח את הפאנל: הוא סוגר בעצמו, וסגירה כאן הייתה פותחת מחדש מיד)
 * @returns {{ onPointerDownCapture: (event: { nativeEvent: Event }) => void }}
 */
export function useOutsidePress(enabled, onOutside, { ignore } = {}) {
  // האירוע (הנייטיב) האחרון שעבר דרך הפאנל — ההשוואה לפי האירוע עצמו ולא דגל בוליאני: ב-Next
  // (hydrateRoot על document) המאזינים של React יושבים על document עצמו ונרשמו לפנינו, כך שכל
  // "איפוס בתחילת לחיצה" ב-capture רץ *אחרי* onPointerDownCapture של הפאנל ומחק את הסימון —
  // וכל לחיצה בתוך הגיליון סגרה אותו. גם לחיצה פנימית שנעצרה לא "דולפת": האירוע הבא הוא אובייקט אחר.
  const insideEvent = useRef(null)
  const latest = useRef({ onOutside, ignore })
  useEffect(() => {
    latest.current = { onOutside, ignore }
  })

  useEffect(() => {
    if (!enabled) return undefined
    const onPointerDown = (event) => {
      const inside = insideEvent.current === event
      insideEvent.current = null
      if (inside) return
      const target = event.target instanceof Element ? event.target : null
      if (target && latest.current.ignore?.(target)) return
      latest.current.onOutside(event)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [enabled])

  const onPointerDownCapture = useCallback((event) => { insideEvent.current = event?.nativeEvent ?? null }, [])
  return { onPointerDownCapture }
}
