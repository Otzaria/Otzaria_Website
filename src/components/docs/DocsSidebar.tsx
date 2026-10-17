'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '@/components/ui/cx'
import { scrollDeltaToReveal } from './scrollSpy'

/** כמה זמן פס הגלילה נשאר גלוי אחרי שהגלילה נעצרה */
const SCROLLBAR_LINGER_MS = 900

/**
 * הסרגל הימני הדביק של אזור המדריכים (ניווט המדריך ו/או "בעמוד זה").
 * - דביק מתחת לכותרת העליונה, בגובה המסך לכל היותר. גולל בפנים רק כשאין ברירה (overflow-y-auto).
 * - פס הגלילה (scrollbar-thin + scrollbar-autohide ב-effects.css): בקצה החיצוני (ימין,
 *   scrollbar-end-right), במרחק מהטקסט — ריפוד בין התוכן לפס, והפס עצמו יוצא לשוליים
 *   (pr-3 / -mr-3, פיזיים כי המכל LTR) כך שהתוכן נשאר מיושר לעמודה. גלוי רק בריחוף, בפוקוס
 *   מקלדת או בזמן גלילה (data-scrolling).
 * - בטעינה: הפריט הנוכחי (aria-current="page") נגלל לתוך התצוגה, בלי אנימציה.
 * [data-sidebar-scroll] — המכל שבו DocsTocLinks מחזיק את הסעיף הנוכחי גלוי.
 */
export default function DocsSidebar({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = ref.current
    if (!box) return
    const current = box.querySelector('[aria-current="page"]')
    if (current && box.scrollHeight > box.clientHeight) {
      const delta = scrollDeltaToReveal(current.getBoundingClientRect(), box.getBoundingClientRect(), 48)
      if (delta !== null) box.scrollTop += delta
    }

    let timer = 0
    const onScroll = () => {
      box.dataset.scrolling = ''
      window.clearTimeout(timer)
      timer = window.setTimeout(() => delete box.dataset.scrolling, SCROLLBAR_LINGER_MS)
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      box.removeEventListener('scroll', onScroll)
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <div
      ref={ref}
      data-sidebar-scroll=""
      className={cx(
        'scrollbar-thin scrollbar-autohide scrollbar-end-right sticky top-24 -mr-3 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain pr-3 pb-4',
        className
      )}
    >
      <div>{children}</div>
    </div>
  )
}
