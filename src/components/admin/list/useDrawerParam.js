'use client'

import { useCallback, useRef } from 'react'

/**
 * מגירה שהמצב שלה בכתובת (?book=, ?user= …). פתיחה — push, כדי ש"אחורה" בדפדפן יסגור אותה; סגירה — "אחורה"
 * אמיתי כשהמגירה נפתחה כאן ב-push (כך ההיסטוריה לא מתמלאת), אחרת (קישור ישיר למגירה) — החלפת הכתובת.
 * openerRef — מזהה השורה שממנה נפתחה (לשם הפוקוס חוזר בסגירה; setOpener — כשהשורה הזו יוצאת מהרשימה). markPushed — כשהמסך עצמו מחזיר את המגירה לכתובת
 * ב-push (למשל "הישאר" אחרי "אחורה" עם שינוי שלא נשמר).
 *
 * @param {(query: any, options?: { push?: boolean }) => void} setQuery
 * @returns {{ openerRef: { current: any }, setOpener: (id: any) => void, open: (id: any, query: any) => void,
 *   close: (query: any) => void, markPushed: () => void }}
 *   open(id, query) — query: הכתובת עם המגירה; close(query) — הכתובת בלי המגירה (כשאין "אחורה")
 */
export function useDrawerParam(setQuery) {
  const openedByPush = useRef(false)
  const openerRef = useRef(null)

  const open = useCallback((id, query) => {
    openerRef.current = id
    openedByPush.current = true
    setQuery(query, { push: true })
  }, [setQuery])

  const close = useCallback((query) => {
    if (openedByPush.current) {
      openedByPush.current = false
      window.history.back()
    } else {
      setQuery(query)
    }
  }, [setQuery])

  const markPushed = useCallback(() => { openedByPush.current = true }, [])
  const setOpener = useCallback((id) => { openerRef.current = id }, [])

  return { openerRef, setOpener, open, close, markPushed }
}
