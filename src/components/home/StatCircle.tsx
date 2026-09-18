'use client'

import { useEffect, useRef, useState } from 'react'
import { formatExactNumber } from '@/lib/homeStats/homeStats'

// עיגול נתון בודד באזור "אוצריא במספרים".
//
// ה-HTML מהשרת מכיל כבר את המספר הסופי (SEO, ובלי הבהוב של 0 לפני ה-hydration).
// רק אחרי ה-hydration, כשהעיגול נכנס לתצוגה בפעם הראשונה, המספר "נספר" מ-0
// עד הערך — ובסוף מוצג תמיד הערך המדויק עצמו. עם prefers-reduced-motion, או
// בדפדפן בלי IntersectionObserver, אין אנימציה כלל והמספר הסופי נשאר כמו שהוא.

// ספירה איטית ורגועה: 3.5 שניות, עם האטה עדינה (ריבועית) לקראת הסוף. האטה
// קובית "שרפה" את רוב הטווח כבר בחלק הראשון, והמספרים נראו קופצים מהר מדי.
const COUNT_UP_DURATION_MS = 3500

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t)
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type StatCircleProps = {
  icon: string
  label: string
  value: number
  index?: number
}

export default function StatCircle({ icon, label, value, index = 0 }: StatCircleProps) {
  const [displayValue, setDisplayValue] = useState(value)
  const circleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = circleRef.current
    if (!element || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return

    let frameId = 0
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()

      let start: number | null = null
      const step = (now: number) => {
        if (start === null) start = now
        const progress = Math.min((now - start) / COUNT_UP_DURATION_MS, 1)
        // בסוף האנימציה — הערך המדויק עצמו, לא תוצאת עיגול של החישוב
        setDisplayValue(progress < 1 ? Math.floor(value * easeOutQuad(progress)) : value)
        if (progress < 1) frameId = requestAnimationFrame(step)
      }
      frameId = requestAnimationFrame(step)
    }, { threshold: 0.4 })

    observer.observe(element)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frameId)
      setDisplayValue(value)
    }
  }, [value])

  const finalText = formatExactNumber(value)

  return (
    <div
      ref={circleRef}
      style={{ animationDelay: `${index * 0.1}s` }}
      className="animate-enter-up mx-auto flex h-32 w-32 flex-col items-center justify-center rounded-full glass-strong border-2 border-primary/20 shadow-lg transition-shadow hover:shadow-xl sm:h-36 sm:w-36 lg:h-44 lg:w-44"
    >
      <span className="material-symbols-outlined text-3xl text-primary lg:text-4xl" aria-hidden="true">
        {icon}
      </span>
      {/* המספר המונפש מוסתר מקוראי מסך (שהיו מקריאים כל שלב בספירה);
          להם מוגש הטקסט הסופי בנפרד */}
      <span
        className="mt-1 whitespace-nowrap text-lg font-bold leading-tight text-on-surface tabular-nums sm:text-xl lg:text-2xl"
        dir="ltr"
        aria-hidden="true"
        data-testid="stat-value"
      >
        {formatExactNumber(displayValue)}
      </span>
      <span className="sr-only">{finalText}</span>
      {/* רוחב מוגבל: תווית ארוכה ("קישורים בין ספרים") נשברת לשתי שורות בתוך העיגול
          במקום לחרוג מהמסגרת העגולה (בתחתית העיגול המיתר צר מקוטר העיגול).
          מתחת ל-lg שמור לתווית גובה של שתי שורות (2 × leading-tight) בכל העיגולים,
          כדי שהאייקון והמספר יישבו באותו גובה בכל העיגולים שבשורה */}
      <span className="mt-0.5 min-h-[2.5em] max-w-[78%] text-balance text-center text-sm leading-tight text-on-surface/70 lg:min-h-0 lg:text-base">
        {label}
      </span>
    </div>
  )
}
