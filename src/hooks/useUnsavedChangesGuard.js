'use client'

import { useCallback, useEffect, useRef } from 'react'

/** סימון הרשומה הכפולה בהיסטוריה (ראו למטה) */
export const SENTINEL = '__unsavedGuard'

/** הטקסטים של "לצאת בלי לשמור?" — אחידים בכל המסכים; body אומר מה לא נשמר */
export const unsavedConfirm = (body) => ({
  title: 'לצאת בלי לשמור?', body, confirmLabel: 'צא בלי לשמור', cancelLabel: 'הישאר', tone: 'danger',
})

/**
 * הקישור שהלחיצה הזו יוצאת דרכו מהדף, או null: לחיצה רגילה (לא Ctrl / לחצן אמצעי — אלה לשונית חדשה)
 * על קישור פנימי לכתובת אחרת. הורדה, לשונית חדשה ונתיב /api/ לא עוזבים את הדף; קישור לאתר אחר —
 * אזהרת הדפדפן (beforeunload).
 * @param {MouseEvent} event
 * @returns {HTMLAnchorElement | null}
 */
export function leavingLink(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null
  const url = new URL(link.href, window.location.href)
  if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return null
  return url.pathname === window.location.pathname && url.search === window.location.search ? null : link
}

/**
 * הגנה על שינויים שלא נשמרו — כל עוד dirty:
 *   רענון / סגירת הלשונית / מעבר לאתר אחר — אזהרת הדפדפן (beforeunload).
 *   "אחורה" בדפדפן (trapBack) — "לצאת בלי לשמור?" (confirmLeave). ביטול — נשארים בדיוק במקום.
 *
 * איך "אחורה" נעצר: אי אפשר לעצור popstate לפני הנתב של Next (ב-Chrome המאזינים על window רצים לפי סדר
 * הרישום, והנתב נרשם ראשון). לכן כשהטופס נעשה "מלוכלך" נוספת להיסטוריה רשומה כפולה של אותה כתובת (עם
 * ה-state של Next — בלי ניווט בנתב). "אחורה" חוזר לאותה כתובת, הדף לא משתנה, ואז שואלים: "הישאר" —
 * הרשומה הכפולה חוזרת; "צא" — "אחורה" נוסף, אמיתי. כשהשינויים נשמרו או בוטלו בלי לצאת — הרשומה הכפולה
 * מוסרת (אחרת "אחורה" הבא לא היה עושה כלום).
 *
 * trapBack=false — רק beforeunload (מגירה: "אחורה" שם נתפס אצל המסך, שמשאיר את המגירה פתוחה ושואל).
 * קישור פנימי (guardLinks) — לא משנה איפה הוא: הסרגל, הכותרת העליונה, הלשוניות או גוף המסך. מאזין אחד על
 * document, בשלב ה-capture: הלחיצה נעצרת לפני ש-next/link רואה אותה, נשאלים, ואחרי "צא" הקישור נלחץ שוב
 * כרגיל (כולל ה-onClick שלו, למשל סגירת מגירת הניהול בטלפון). כך אף קישור לא צריך להכיר את ההגנה.
 * guardLinks=false — כשהגנה אחרת באותו מסך כבר שואלת, או כשמעבר בתוך האתר לא מאבד כלום.
 * פעולה בתוך המסך שמאבדת שינויים (סגירת מגירה, "רענן") — אצל הקורא: guardLeave() לפניה. אחרי אישור
 * ההגנה משוחררת (עד שיש שינוי חדש) — כדי שהניווט שבא אחריו לא ייעצר שוב.
 *
 * @param {boolean} dirty
 * @param {() => Promise<boolean>} confirmLeave — "לצאת בלי לשמור?"; true — לצאת
 * @param {{ trapBack?: boolean, guardLinks?: boolean }} [options]
 * @returns {{ guardLeave: () => Promise<boolean> }} guardLeave — true אם אפשר לצאת (אין שינוי, או שאושר)
 */
export function useUnsavedChangesGuard(dirty, confirmLeave, { trapBack = true, guardLinks = true } = {}) {
  const dirtyRef = useRef(dirty)
  const confirmRef = useRef(confirmLeave)
  const releasedRef = useRef(false)
  const askingRef = useRef(false)
  useEffect(() => {
    dirtyRef.current = dirty
    confirmRef.current = confirmLeave
  })

  // הסרת הרשומה הכפולה היא "אחורה" — אסינכרוני. ניווט בקישור שמתחיל לפני שה-popstate שלו הגיע מתבטל בידי
  // הנתב (כך "עצור וצא" לא יצא: העצירה איפסה את dirty, הניקוי עשה "אחורה", והקישור נלחץ באמצע). לכן ההסרה
  // נשמרת כהבטחה, והקישור נלחץ רק אחריה.
  const backRef = useRef(null)
  const dropSentinel = useCallback(() => {
    if (backRef.current) return backRef.current
    if (!window.history.state?.[SENTINEL]) return Promise.resolve()
    // שינוי סינון / עמוד (replaceState) בזמן שההגנה פעילה משנה את הכתובת של הרשומה הכפולה בלבד; "אחורה" מחזיר
    // לכתובת הקודמת — מחזירים אותה אחר כך, כדי שהסינון לא יאבד
    const target = new URL(window.location.href)
    backRef.current = new Promise((resolve) => {
      const done = () => {
        window.removeEventListener('popstate', done)
        clearTimeout(timer)
        backRef.current = null
        // רק באותו נתיב ובאותה רשומה (לא אחרי ניווט למקום אחר, ולא כש-popstate הגיע מ"אחורה" אחר)
        if (window.location.pathname === target.pathname && window.location.search !== target.search && !window.history.state?.[SENTINEL]) {
          window.history.replaceState(window.history.state, '', target.href)
        }
        resolve()
      }
      const timer = setTimeout(done, 1000)
      window.addEventListener('popstate', done)
      window.history.back()
    })
    return backRef.current
  }, [])

  useEffect(() => {
    releasedRef.current = false
    if (!dirty) return undefined
    const onBeforeUnload = (event) => {
      if (releasedRef.current) return
      event.preventDefault()
      // דפדפנים ישנים דורשים returnValue כדי להציג את האזהרה
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    if (!trapBack) return () => window.removeEventListener('beforeunload', onBeforeUnload)

    const href = window.location.href
    const base = window.history.state
    const pushSentinel = () => window.history.pushState({ ...(base || {}), [SENTINEL]: true }, '', href)
    if (!window.history.state?.[SENTINEL]) pushSentinel()
    let asking = false
    let leaving = false
    const onPopState = () => {
      if (leaving || releasedRef.current || !dirtyRef.current || asking) return
      // חזרנו מהרשומה הכפולה לאותה כתובת — שואלים
      if (window.location.href !== href || window.history.state?.[SENTINEL]) return
      asking = true
      Promise.resolve(confirmRef.current?.()).then((ok) => {
        asking = false
        if (!ok) {
          pushSentinel()
          return
        }
        leaving = true
        releasedRef.current = true
        window.history.back()
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('popstate', onPopState)
      // נשמר / בוטל בלי לצאת — מורידים את הרשומה הכפולה
      // לא בודקים כתובת: שינוי סינון בזמן ההגנה שינה אותה, והרשומה הכפולה (state) עדיין שם. אחרי ניווט ל-state
      // אחר dropSentinel לא עושה כלום
      if (!leaving) dropSentinel()
    }
  }, [dirty, trapBack, dropSentinel])

  const guardLeave = useCallback(async () => {
    if (!dirtyRef.current || releasedRef.current) return true
    if (askingRef.current) return false
    askingRef.current = true
    try {
      const ok = Boolean(await confirmRef.current?.())
      if (ok) releasedRef.current = true
      return ok
    } finally {
      askingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!dirty || !guardLinks) return undefined
    const onClick = (event) => {
      if (releasedRef.current) return
      const link = leavingLink(event)
      if (!link) return
      event.preventDefault()
      event.stopPropagation()
      guardLeave().then(async (ok) => {
        if (!ok) return
        // יוצאים — הרשומה הכפולה לא נחוצה, ו"אחורה" שלה חייב להסתיים לפני שהקישור מתחיל לנווט
        if (trapBack) await dropSentinel()
        if (link.isConnected) link.click()
        else window.location.assign(link.href)
      })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty, guardLinks, guardLeave, trapBack, dropSentinel])

  return { guardLeave }
}
