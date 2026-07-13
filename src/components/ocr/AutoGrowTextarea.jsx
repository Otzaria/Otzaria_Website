'use client'

import { useRef, useEffect } from 'react'

// תיבת טקסט חד-שורתית שמתרחבת אוטומטית לגובה התוכן — שורה ארוכה נגללת
// לשורות תצוגה נוספות במקום להיחתך. Enter שמור לפעולת השמירה של ההורה
// (התמלול הוא שורה לוגית אחת; מעברי שורה ממילא מתנרמלים לרווח).
export default function AutoGrowTextarea({ value, className = '', ...props }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={`resize-none overflow-hidden ${className}`}
      {...props}
    />
  )
}
