'use client'

import { useEffect, useRef, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'

/**
 * תזכורת 20-20-20: כל 20 דקות — להסתכל 20 שניות על משהו רחוק. הודעה לא חוסמת בפינת
 * העורך: לא לוכדת פוקוס ולא גונבת אותו מהטקסט; ההכרזה דרך role="status".
 *
 * שלבים: הזמנה ("התחל 20 שניות" / "אחר כך") → ספירה לאחור → "אפשר לחזור לעבודה" (נסגר לבד).
 * ההורה מרנדר את הרכיב כשהגיע הזמן, ומחליט מתי להציג שוב:
 *   onSnooze — "אחר כך" (למשל עוד 5 דקות); onDone — אחרי סיום הספירה (מאפס את מחזור 20 הדקות).
 *
 * @param {{ onSnooze: () => void, onDone: () => void, seconds?: number, intervalMin?: number, className?: string }} props
 */
export default function RestReminder({ onSnooze, onDone, seconds = 20, intervalMin = 20, className }) {
  const [counting, setCounting] = useState(false)
  const [left, setLeft] = useState(seconds)
  // השלב נגזר: prompt → counting → done (הספירה הגיעה לאפס)
  const phase = !counting ? 'prompt' : left > 0 ? 'counting' : 'done'
  // "התחל" נעלם בלחיצה — הפוקוס עובר ל"דלג" ולא נופל ל-body
  const skipRef = useRef(null)
  const startedByKeyboardFocus = useRef(false)

  useEffect(() => {
    if (counting && startedByKeyboardFocus.current) skipRef.current?.focus()
    startedByKeyboardFocus.current = false
  }, [counting])

  useEffect(() => {
    if (phase !== 'counting') return undefined
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'done') return undefined
    const id = setTimeout(onDone, 2500)
    return () => clearTimeout(id)
  }, [phase, onDone])

  const message = phase === 'prompt'
    ? `עברו ${intervalMin} דקות. הסתכל ${seconds} שניות על משהו רחוק.`
    : phase === 'counting'
      ? 'הסתכל על משהו רחוק.'
      : 'יפה. אפשר לחזור לעבודה.'

  return (
    <section
      aria-label="תזכורת מנוחה"
      className={cx(
        'flex max-w-md flex-wrap items-center gap-x-3 gap-y-1 rounded-(--radius-card) bg-on-surface py-2 pe-2 ps-4 text-body-sm text-surface shadow-overlay',
        'animate-enter-toast motion-reduce:animate-none',
        className
      )}
    >
      <AppIcon name="visibility" className="text-xl" />
      <p role="status" className="min-w-0 flex-1">
        {message}
        {phase === 'counting' && (
          <span className="ms-1 font-semibold tabular-nums" aria-hidden="true">{left}</span>
        )}
      </p>
      {phase === 'prompt' && (
        <span className="flex items-center gap-1">
          <ToastButton onClick={(event) => { startedByKeyboardFocus.current = event.currentTarget === document.activeElement; setCounting(true) }}>{`התחל ${seconds} שניות`}</ToastButton>
          <ToastButton onClick={onSnooze}>אחר כך</ToastButton>
        </span>
      )}
      {phase === 'counting' && <ToastButton ref={skipRef} onClick={onSnooze}>דלג</ToastButton>}
    </section>
  )
}

/** כפתור על רקע כהה (ui/Button לא מקבל דריסת צבע) — טקסט בצבע surface, ריחוף שקוף */
function ToastButton({ ref, onClick, children }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cx('min-h-(--touch-target) rounded-(--radius-control) px-3 text-label-md text-surface hover:bg-surface/15', FOCUS_RING)}
    >
      {children}
    </button>
  )
}
