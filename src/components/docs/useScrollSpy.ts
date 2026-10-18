'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { anchorId, lastHeadingAbove } from './scrollSpy'

/** קו הסעיף: כותרת שעברה את 40% העליונים של המסך — הסעיף שלה הוא הנוכחי */
const BAND = 0.4

/**
 * scroll-spy לתוכן העניינים: האינדקס (ב-ids) של הסעיף שהקורא נמצא בו (בראש הדף — הראשון;
 * -1 רק לפני שהמדידה הראשונה רצה).
 * IntersectionObserver בלבד — בלי מאזין scroll: כל בלוק במאמר שחוצה את קו ה-40% העליונים מפעיל
 * מדידה, והסעיף הנוכחי הוא של הכותרת האחרונה שמעל הקו (lastHeadingAbove). [data-docs-end] בסוף
 * המאמר מסמן סעיפים קצרים בסוף הדף שלא יגיעו לקו.
 *
 * select(index) — לחיצה בתוכן העניינים: מסמן מיד, ומקפיא את ה-spy עד שהקפיצה נגמרת (scrollend),
 * כדי שסעיף קצר שאליו קפצו לא "יברח" לסעיף שלפניו.
 */
export function useScrollSpy(ids: readonly string[]) {
  const [active, setActive] = useState(-1)
  const currentRef = useRef(-1)
  const lockRef = useRef(false)
  const releaseRef = useRef<(() => void) | null>(null)
  const key = ids.join('\n')

  // לפני הכותרת הראשונה (ראש הדף) — הסעיף הראשון מסומן, כדי שתמיד יהיה סימון "אתם כאן"
  const commit = useCallback((raw: number) => {
    const index = Math.max(0, raw)
    if (index === currentRef.current) return
    currentRef.current = index
    setActive(index)
  }, [])

  const select = useCallback(
    (index: number) => {
      releaseRef.current?.()
      commit(index)
      lockRef.current = true
      let timer = 0
      const release = () => {
        lockRef.current = false
        window.removeEventListener('scrollend', onEnd)
        window.clearTimeout(timer)
        if (releaseRef.current === release) releaseRef.current = null
      }
      // אחרי scrollend — עוד פריים, כדי שה-callback של ה-IO מהקפיצה עצמה ייבלע בנעילה
      const onEnd = () =>
        requestAnimationFrame(() => {
          window.clearTimeout(timer)
          timer = window.setTimeout(release, 50)
        })
      window.addEventListener('scrollend', onEnd)
      // דפדפן בלי scrollend, או קפיצה שלא גללה (היעד כבר במקום)
      timer = window.setTimeout(release, 'onscrollend' in window ? 3000 : 1000)
      releaseRef.current = release
    },
    [commit]
  )

  // רכיב שיורד באמצע נעילה — בלי טיימר ומאזין יתומים
  useEffect(() => () => releaseRef.current?.(), [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const list = key ? key.split('\n') : []
    const headings = list.map((id) => document.getElementById(id))
    const present = headings.filter((el): el is HTMLElement => el !== null)
    if (present.length === 0) return

    const tops = () => headings.map((el) => (el ? el.getBoundingClientRect().top : Number.POSITIVE_INFINITY))
    let atEnd = false

    // הסעיף נקבע מהגאומטריה בכל פעם (לא מה-entries), כך שגם קפיצה שמדלגת על הרצועה כולה
    // (PageDown, Home, גלילה מהירה) מסומנת נכון
    const update = () => {
      if (lockRef.current) return
      let next = lastHeadingAbove(tops(), window.innerHeight * BAND)
      // סוף המאמר גלוי: גם סעיף קצר שכותרתו בחצי העליון של המסך נחשב נוכחי
      if (atEnd) next = Math.max(next, lastHeadingAbove(tops(), window.innerHeight / 2))
      commit(next)
    }

    // מצב פתיחה: עוגן ב-URL שכותרתו גלויה גובר (סעיף קצר בסוף הדף לא מגיע לראש המסך)
    const hashed = list.indexOf(anchorId(window.location.hash))
    const hashedTop = hashed === -1 ? null : tops()[hashed]
    if (hashedTop !== null && hashedTop >= 0 && hashedTop < window.innerHeight) commit(hashed)
    else update()

    // טריגר לכל גלילה, בלי מאזין scroll: כל בלוק במאמר (וכל כותרת) שחוצה את קו הרצועה
    const article = present[0].closest('article')
    const blocks = new Set<Element>(present)
    article?.querySelectorAll(':scope > *, :scope > * > *').forEach((el) => blocks.add(el))
    const band = new IntersectionObserver(update, { rootMargin: `0px 0px -${(1 - BAND) * 100}% 0px` })
    blocks.forEach((el) => band.observe(el))

    const end = document.querySelector('[data-docs-end]')
    const endObserver = new IntersectionObserver(([entry]) => {
      atEnd = entry.isIntersecting
      update()
    })
    if (end) endObserver.observe(end)

    // חזרה/קדימה בדפדפן בין עוגנים
    const onHash = () => {
      const index = list.indexOf(anchorId(window.location.hash))
      if (index !== -1) commit(index)
    }
    window.addEventListener('hashchange', onHash)

    return () => {
      band.disconnect()
      endObserver.disconnect()
      window.removeEventListener('hashchange', onHash)
    }
  }, [key, commit])

  return { active, select }
}

