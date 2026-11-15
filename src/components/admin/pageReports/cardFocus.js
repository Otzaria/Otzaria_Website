// מקלדת ופוקוס בכרטיסי הדיווחים — עזרי DOM קטנים שמשותפים לשני סוגי הכרטיסים.

import { useEffect, useRef } from 'react'

/** שדה טקסט — שם המקשים שייכים להקלדה */
export const isTextEntry = (el) => el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type)))

/** מעבר לכרטיס הקודם / הבא ברשימה (J / K, ↑ ↓) */
export function moveCardFocus(card, step) {
  const list = card?.parentElement
  if (!list) return
  const cards = [...list.querySelectorAll(':scope > [data-report-card]')]
  cards[cards.indexOf(card) + step]?.focus()
}

/**
 * אחרי הכרעה שמשאירה את הכרטיס ברשימה (למשל אישור בסינון "הכול", "פתח מחדש"), הכפתור שבפוקוס נעלם מהכרטיס
 * והפוקוס נופל לגוף הדף. כאן: כשהמצב (stateKey) משתנה והפוקוס אבד — לכרטיס עצמו, כדי שאפשר להמשיך במקלדת.
 * כרטיס שיצא מהרשימה — בטיפול useFocusAfterRemove. מחזיר ref לכרטיס.
 * @param {string} stateKey
 */
export function useKeepCardFocus(stateKey) {
  const ref = useRef(/** @type {HTMLElement | null} */ (null))
  const previous = useRef(stateKey)
  useEffect(() => {
    if (previous.current === stateKey) return
    previous.current = stateKey
    const active = document.activeElement
    if (ref.current?.isConnected && (!active || active === document.body)) ref.current.focus({ preventScroll: true })
  }, [stateKey])
  return ref
}
