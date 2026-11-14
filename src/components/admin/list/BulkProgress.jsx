'use client'

import { useEffect, useRef } from 'react'
import Button from '@/components/ui/Button'
import ProgressBar from '@/components/ui/ProgressBar'
import { ACTION_BUTTON } from './BulkActionBar'

/**
 * פעולה מרובה באמצע — במקום הכפתורים של שורת הבחירה: "X מתוך Y", פס התקדמות ו"עצור".
 * text — מה קורה עכשיו; value / max — למדידת הפס.
 * announce — מה שקורא המסך מכריז (ברירת מחדל: text). מסך עם אלפי פריטים מעביר כאן טקסט שמשתנה רק מדי פעם
 *   (בהתחלה, כל 10%, בסוף) — כדי שלא תהיה הכרזה על כל פריט.
 * stopping — "עצור" נלחץ, ומחכים למה שכבר יצא: במקום הטקסט "עוצר…", ו"עצור" לא פעיל.
 * focusStop — הפוקוס עובר ל"עצור" כשהשורה מופיעה, אם הוא אבד (הכפתור שנלחץ הוחלף בשורה הזו).
 * @param {{ text: string, value: number, max: number, onStop: () => void, focusStop?: boolean, announce?: string, stopping?: boolean }} props
 */
export default function BulkProgress({ text, value, max, onStop, focusStop = false, announce, stopping = false }) {
  const stopRef = useRef(null)
  useEffect(() => {
    if (!focusStop) return
    const active = document.activeElement
    if (!active || active === document.body) stopRef.current?.focus()
  }, [focusStop])
  const shown = stopping ? 'עוצר…' : text
  // הכרזה נפרדת רק כשהיא שונה מהטקסט הגלוי (announce); אחרת — הטקסט עצמו הוא אזור ההכרזה, כמו קודם
  const separate = announce !== undefined
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p role={separate ? undefined : 'status'} aria-hidden={separate || undefined} className="text-body-sm tabular-nums whitespace-nowrap">{shown}</p>
      {separate && <p role="status" className="sr-only">{stopping ? shown : announce}</p>}
      <ProgressBar value={value} max={max} label="התקדמות הפעולה" className="w-24 max-sm:hidden" />
      <Button ref={stopRef} className={ACTION_BUTTON} variant="text" size="sm" icon="stop_circle" onClick={onStop} softDisabled={stopping}>עצור</Button>
    </div>
  )
}
