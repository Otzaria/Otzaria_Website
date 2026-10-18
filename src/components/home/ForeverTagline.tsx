'use client'

// "חינם" → "חינם לנצח!" — השורה המונפשת שצמודה מתחת לספר בגיבור.
//
// פעם אחת, ונעצרת: "חינם" מופיע לבד וממורכז, מחליק ימינה ומפנה מקום, ו"לנצח!" נכנס למקום
// שהתפנה (אות אחר אות) — ו"חינם לנצח!" נשאר ממורכז. התזמון וה-easing כולם ב-CSS
// (animations.css, "חינם → חינם לנצח!", fill-mode forwards). כאן רק:
// - המבנה: השורה היא תמיד הצירוף המלא, כך שהמקום שמור ברוחבו ואין קפיצת layout;
// - מדידת --forever-shift (חצי רוחב "לנצח!" + חצי הרווח — foreverShift): זה ה-JS היחיד
//   מלבד תזמון ההתחלה. רוחב המילה תלוי בגופן ובשבירת המסך, ולכן נמדד, ומחדש בכל שינוי גודל;
// - play — ההתחלה, אחרי שהספר סיים להיפתח (HeroEmblem).
//
// נגישות: לקורא מסך — טקסט קבוע ("חינם לנצח"), בלי aria-live; האנימציה עצמה aria-hidden.
// reduced-motion: "חינם לנצח!" סטטי מיד (CSS).

import { useEffect, useRef, type CSSProperties } from 'react'
import { foreverShift } from './foreverTaglineLogic'

const FIRST = 'חינם'
const FINAL = 'לנצח!'
// שתי המילים בגופן התצוגה (OT Vilna Regular — הוא נטען בלי Bold): "חינם" בצבע הטקסט הכהה,
// ו"לנצח!" בצבע הראשי — הצבע הוא ההדגשה של הצירוף
const FIRST_CLASS = 'inline-block font-display font-normal text-on-surface'
const FINAL_CLASS = 'inline-block font-display font-normal text-primary'

function useForeverShift(lineRef: React.RefObject<HTMLSpanElement | null>, finalRef: React.RefObject<HTMLSpanElement | null>) {
  useEffect(() => {
    const line = lineRef.current
    const final = finalRef.current
    if (!line || !final) return
    // offsetWidth — רוחב ה-layout, בלי ה-transform של האנימציה
    const measure = () => {
      const gap = parseFloat(getComputedStyle(line).columnGap) || 0
      line.style.setProperty('--forever-shift', `${foreverShift(final.offsetWidth, gap)}px`)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(final)
    return () => observer?.disconnect()
  }, [lineRef, finalRef])
}

export default function ForeverTagline({ play, className = '' }: { play: boolean; className?: string }) {
  const lineRef = useRef<HTMLSpanElement>(null)
  const finalRef = useRef<HTMLSpanElement>(null)
  useForeverShift(lineRef, finalRef)

  return (
    <p className={`text-center text-[1.75rem] leading-none lg:text-[2.125rem] 2xl:text-[2.5rem] short:lg:text-[1.875rem] ${className}`} data-state={play ? 'play' : 'idle'}>
      <span className="sr-only">{FIRST} {FINAL.replace('!', '')}</span>
      {/* השורה המלאה, ממורכזת — "חינם" ראשון ב-DOM, ולכן ב-RTL מימין ל"לנצח!" */}
      <span ref={lineRef} aria-hidden="true" className="forever-line inline-flex items-baseline gap-x-[0.28em] whitespace-nowrap">
        <span className={`forever-first ${FIRST_CLASS}`}>{FIRST}</span>
        <span ref={finalRef} className={FINAL_CLASS} data-testid="forever-final">
          {Array.from(FINAL).map((letter, index) => (
            <span key={index} className="forever-letter" style={{ '--i': index } as CSSProperties}>{letter}</span>
          ))}
        </span>
      </span>
    </p>
  )
}
