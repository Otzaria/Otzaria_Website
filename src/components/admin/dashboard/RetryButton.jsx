'use client'

import { useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'

/**
 * "נסה שוב" — מרענן את נתוני השרת של העמוד (router.refresh), בלי נקודת קצה נוספת: הספירות
 * נעשות מחדש ב-Server Component.
 *
 * פוקוס: בזמן הטעינה הכפתור לא נעשה disabled (דפדפן מעביר את הפוקוס מכפתור מושבת ל-body) אלא
 * aria-disabled. אם הטעינה הצליחה, הכפתור נעלם יחד עם כרטיס השגיאה — ואז הפוקוס עובר לכותרת
 * האזור (focusAfterRetry), ולא נופל לראש העמוד. אם נכשלה שוב — הכפתור נשאר, והפוקוס עליו.
 */
export default function RetryButton({ label = 'נסה שוב', describedBy, focusAfterRetry }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const hadFocus = useRef(false)

  useEffect(() => () => {
    // הכפתור יורד מהעמוד: אם הפוקוס היה עליו — לכותרת האזור, אחרי שהתוכן החדש במקומו
    if (!hadFocus.current || !focusAfterRetry) return
    setTimeout(() => {
      const active = document.activeElement
      if (active && active !== document.body) return
      document.getElementById(focusAfterRetry)?.focus()
    }, 0)
  }, [focusAfterRetry])

  return (
    <Button
      variant="outlined"
      size="sm"
      icon="refresh"
      iconClassName={pending ? 'animate-spin motion-reduce:animate-none' : undefined}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      aria-describedby={describedBy}
      onFocus={() => { hadFocus.current = true }}
      onBlur={() => { hadFocus.current = false }}
      onClick={() => {
        if (pending) return
        hadFocus.current = true
        startTransition(() => router.refresh())
      }}
    >
      {pending ? 'טוען…' : label}
    </Button>
  )
}
