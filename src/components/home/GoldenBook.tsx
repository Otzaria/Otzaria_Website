'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import { planBookOpening, readSaveData } from './goldenBookPlan'

// הספר המוזהב של אוצריא נפתח בתוך הילה חמה — גיבור דף הבית (מהמתקין: GLOW #E9B96A
// ו-24 פריימי הפתיחה של download-assistant).
//
// רצף התצוגה:
// 1. ה-HTML מהשרת מכיל את הפריים הראשון — הספר הסגור (golden-book-closed.webp, ~20KB, תמונת
//    ה-LCP) — כך שהפתיחה מתחילה ממנו ואין "פתוח → נסגר → נפתח".
// 2. אחרי ה-hydration מחליטים אם לנגן (planBookOpening): עם prefers-reduced-motion או חיסכון
//    בנתונים — לא מורידים את הרצועה (~300KB) בכלל, ועוברים לספר הפתוח.
// 3. אחרת הרצועה נטענת ב-new Image() מתוך ה-effect (ולא preload בזמן הרינדור, שהיה מתחרה
//    ב-LCP ובגופנים בכל ביקור). כשהיא מפוענחת: אם עדיין מוקדם (OPEN_DEADLINE_MS מתחילת
//    הניווט) — מנגנים פעם אחת (1 שנייה, 24fps). אם מאוחר מזה (רשת או מכשיר איטיים), או
//    שהטעינה נכשלה — מציגים את הספר הפתוח בלי אנימציה, כדי שאף אחד לא יעמוד מול ספר סגור.
// 4. בסוף הרצועה עוברים לתמונת הספר הפתוח (golden-book.webp, 560px — חדה יותר מפריים
//    הרצועה, 360px). היא נטענת רק כשצריך אותה — בזמן הניגון, או במסלולי הגיבוי — ומפוענחת
//    לפני ההחלפה, כך שאין הבהוב.
//
// onOpened — נקרא פעם אחת כשהספר פתוח (סוף הרצועה, או במסלולי הגיבוי), כדי שמה שבא אחריו
// (ForeverTagline) יתחיל בדיוק כשהפתיחה נגמרת.
//
// OPEN_DEADLINE_MS נמדד מתחילת הניווט (performance.now). לכן בניווט צד-לקוח חזרה לדף הבית
// (performance.now כבר גדול) האנימציה לא מתנגנת, והספר עובר ישר לפתוח — בכוונה: מי שחוזר
// לדף כבר ראה אותה.

// הנתיב היחיד של הרצועה — גם ל-background-image (style), ולא כפול ב-animations.css
const SPRITE_SRC = '/home/golden-book-sprite.webp'
const CLOSED_SRC = '/home/golden-book-closed.webp'
const OPEN_SRC = '/home/golden-book.webp'
const OPEN_DEADLINE_MS = 1500

type Phase = 'closed' | 'opening' | 'open'

/** טוען ומפענח תמונה; מתממש תמיד — true אם היא מוכנה, false בכשל */
function loadImage(src: string, { lowPriority = false } = {}): Promise<boolean> {
  const img = new Image()
  if (lowPriority) img.fetchPriority = 'low'
  img.src = src
  return img.decode().then(() => true, () => false)
}

export default function GoldenBook({ className = '', onOpened }: {
  className?: string
  onOpened?: () => void
}) {
  const [phase, setPhase] = useState<Phase>('closed')
  const onOpenedRef = useRef(onOpened)
  const openedFired = useRef(false)
  const openReady = useRef<Promise<boolean> | null>(null)
  const mounted = useRef(true)
  useEffect(() => { onOpenedRef.current = onOpened }, [onOpened])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const fireOpened = useCallback(() => {
    if (openedFired.current) return
    openedFired.current = true
    onOpenedRef.current?.()
  }, [])
  // הספר הפתוח — נטען פעם אחת, רק כשבאמת עומדים להציג אותו
  const loadOpen = useCallback((lowPriority = false) => {
    openReady.current ??= loadImage(OPEN_SRC, { lowPriority })
    return openReady.current
  }, [])
  // אם התמונה הפתוחה לא נטענה — לא מחליפים לתמונה שבורה: נשארים על מה שמוצג (הספר הסגור,
  // או הפריים האחרון של הרצועה), ורק ממשיכים את הרצף (onOpened)
  const showOpen = useCallback(() => {
    loadOpen().then((ok) => {
      if (!mounted.current) return
      if (ok) setPhase('open')
      else fireOpened()
    })
  }, [loadOpen, fireOpened])

  // מסלולי הגיבוי (reduced-motion, חיסכון בנתונים, רשת איטית, כשל) — אין רצועה שתסתיים
  useEffect(() => {
    if (phase === 'open') fireOpened()
  }, [phase, fireOpened])

  useEffect(() => {
    let cancelled = false
    if (planBookOpening({ reducedMotion: prefersReducedMotion(), saveData: readSaveData() }) === 'static') {
      showOpen()
      return () => { cancelled = true }
    }
    // אם הרצועה לא מוכנה עד המועד — לא מחכים לה
    const deadline = window.setTimeout(() => { if (!cancelled) showOpen() }, Math.max(0, OPEN_DEADLINE_MS - performance.now()))
    const sprite = new Image()
    sprite.src = SPRITE_SRC
    // decode() מבטיח שאין הבהוב של אלמנט ריק בזמן ההחלפה
    sprite.decode()
      .then(() => {
        if (cancelled || performance.now() > OPEN_DEADLINE_MS) return
        window.clearTimeout(deadline)
        setPhase('opening')
        // התמונה הסופית — ברקע, בזמן שהרצועה מתנגנת
        loadOpen(true)
      })
      .catch(() => { if (!cancelled) showOpen() })
    return () => {
      cancelled = true
      window.clearTimeout(deadline)
    }
  }, [showOpen, loadOpen])

  // סוף הרצועה: הספר פתוח (ForeverTagline מתחיל), והפריים האחרון מתחלף בתמונה החדה
  const onSpriteEnd = useCallback(() => {
    fireOpened()
    showOpen()
  }, [fireOpened, showOpen])

  return (
    <div className={`relative mx-auto aspect-square ${className}`}>
      {/* ההילה החמה — גרדיאנט CSS, לא תמונה. רחבה מהספר, ולכן הגיבור חותך אותה
          (overflow-hidden) כדי שלא תיצור גלילה אופקית בנייד */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div
          className="absolute left-1/2 top-1/2 size-[190%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              'radial-gradient(closest-side, rgb(233 185 106 / 0.68), rgb(233 185 106 / 0.26) 45%, rgb(233 185 106 / 0.06) 75%, transparent)'
          }}
        />
      </div>
      <div className="relative size-full">
        {/* opacity-0 ולא invisible בזמן הניגון: התמונה (וה-alt שלה) נשארת בעץ הנגישות */}
        <img
          src={phase === 'open' ? OPEN_SRC : CLOSED_SRC}
          alt="לוגו אוצריא"
          width={560}
          height={560}
          fetchPriority="high"
          className={`size-full ${phase === 'opening' ? 'opacity-0' : ''}`}
        />
        {phase === 'opening' && (
          <span
            aria-hidden="true"
            className="golden-book-sprite absolute inset-0"
            style={{ backgroundImage: `url('${SPRITE_SRC}')` }}
            onAnimationEnd={onSpriteEnd}
          />
        )}
      </div>
    </div>
  )
}
