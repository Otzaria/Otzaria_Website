'use client'

import { useEffect, useMemo, useRef } from 'react'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'
import { REDUCED_MOTION_QUERY } from '@/lib/reducedMotion'
import { anchorId, scrollDeltaToReveal } from './scrollSpy'
import { useScrollSpy } from './useScrollSpy'
import type { TocItem } from './docsNav'

/**
 * רשימת הקישורים של תוכן העניינים, עם scroll-spy: הסעיף הנוכחי מודגש (צבע, משקל ופס דק מעוגל
 * בצד ההתחלה — בלי רקע לשורה) ומסומן aria-current="location". כשהרשימה בתוך סרגל עם גלילה פנימית
 * ([data-sidebar-scroll], ראו DocsSidebar) — הפריט המודגש נגלל לתוך התצוגה; ב-reduced-motion בלי
 * אנימציה.
 * compact — שורות צפופות (סרגל במסך רחב, עכבר); בלעדיו — מטרת מגע מלאה (מקפל בנייד).
 */
export default function DocsTocLinks({ items, compact }: { items: TocItem[]; compact: boolean }) {
  const ids = useMemo(() => items.map((item) => anchorId(item.href)), [items])
  const { active, select } = useScrollSpy(ids)
  const listRef = useRef<HTMLUListElement>(null)
  // הגלילה הראשונה (בטעינה) — מיידית; אחר כך חלקה, אלא אם reduced-motion
  const revealedRef = useRef(false)

  useEffect(() => {
    if (active < 0) return
    const link = listRef.current?.querySelectorAll('a')[active]
    const box = link?.closest<HTMLElement>('[data-sidebar-scroll]')
    if (!link || !box || box.scrollHeight <= box.clientHeight) return
    const delta = scrollDeltaToReveal(link.getBoundingClientRect(), box.getBoundingClientRect())
    const first = !revealedRef.current
    revealedRef.current = true
    if (delta === null) return
    const reduce = window.matchMedia?.(REDUCED_MOTION_QUERY).matches
    box.scrollBy({ top: delta, behavior: first || reduce ? 'auto' : 'smooth' })
  }, [active])

  return (
    <ul ref={listRef} className="space-y-0.5">
      {items.map((item, index) => {
        const current = index === active
        return (
          <li key={item.href}>
            <a
              href={item.href}
              aria-current={current ? 'location' : undefined}
              onClick={() => select(index)}
              className={cx(
                // בלי רקע לשורה: הנוכחי — צבע ומשקל, ופס דק מעוגל בצד ההתחלה (ימין), כך שלא רק צבע מסמן
                'relative flex items-center rounded-control px-3 py-1.5 text-body-sm transition-colors',
                compact ? 'min-h-0' : 'min-h-(--touch-target)',
                current
                  ? 'font-semibold text-primary before:absolute before:inset-y-1.5 before:start-0 before:w-0.75 before:rounded-full before:bg-primary'
                  : 'text-on-surface-variant hover:text-on-surface',
                FOCUS_RING_INSET
              )}
            >
              {item.label}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
