'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { preload } from 'react-dom'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import { chooseSpriteSrc, openingDeadline, planBookOpening, readBookConnection } from './goldenBookPlan'
import { BOOK_SIZES, CLOSED_SRC, CLOSED_SRCSET, OPEN_SRC, OPEN_SRCSET } from './goldenBookAssets'

// הספר המוזהב של אוצריא נפתח בתוך הילה חמה — גיבור דף הבית (מהמתקין: GLOW #E9B96A
// ו-24 פריימי הפתיחה של download-assistant, מהם נשארו 12 — כל פריים שני — להקטנת ההורדה והזיכרון).
//
// תמונת הספר הסגור זמינה כבר ב-HTML, והספר הפתוח נטען בעדיפות נמוכה.
// לאחר hydration מחכים לפענוח התמונה הראשונה ובודקים את החיבור לפני הורדת
// רצועת האנימציה. כשהרצועה לא מוכנה בזמן מציגים את תמונת הספר הפתוח.
type Phase = 'closed' | 'opening' | 'open'

const noSubscribe = () => () => {}
/**
 * האם הרכיב עלה ב-hydration של ה-HTML מהשרת (טעינת דף), ולא ברינדור צד-לקוח (ניווט).
 * ב-hydration React משתמש ב-getServerSnapshot (true), וברינדור צד-לקוח ב-getSnapshot (false);
 * הערך של הרינדור הראשון נשמר ב-state, כי מיד אחרי ה-hydration React מרנדר שוב עם false.
 */
function useMountedByHydration() {
  const hydrating = useSyncExternalStore(noSubscribe, () => false, () => true)
  const [byHydration] = useState(hydrating)
  return byHydration
}

/** טוען ומפענח תמונה; מתממש תמיד — true אם היא מוכנה, false בכשל */
function loadImage(src: string, { lowPriority = false, srcSet, sizes }: {
  lowPriority?: boolean
  srcSet?: string
  sizes?: string
} = {}): Promise<boolean> {
  const img = new Image()
  if (lowPriority) img.fetchPriority = 'low'
  // sizes/srcset לפני src — הדפדפן בוחר אז את אותו מועמד ש-<img> בדף יבחר (ושה-preload ביקש)
  if (srcSet) {
    if (sizes) img.sizes = sizes
    img.srcset = srcSet
  }
  img.src = src
  return img.decode().then(() => true, () => false)
}

export default function GoldenBook({ className = '', onOpened }: {
  className?: string
  onOpened?: () => void
}) {
  // רק ברינדור השרת: ה-<link> נכנס ל-<head> של ה-HTML הראשון. בדפדפן הוא כבר שם (טעינת דף),
  // ובניווט צד-לקוח אין צורך בו (לא מנגנים). הספר הפתוח קודם — הוא קטן ונחוץ בכל מסלול.
  if (typeof window === 'undefined') {
    preload(OPEN_SRC, { as: 'image', fetchPriority: 'low', imageSrcSet: OPEN_SRCSET, imageSizes: BOOK_SIZES })
  }
  const hydrated = useMountedByHydration()
  const [phase, setPhase] = useState<Phase>('closed')
  const [spriteSrc, setSpriteSrc] = useState<string | null>(null)
  const onOpenedRef = useRef(onOpened)
  const openedFired = useRef(false)
  const openReady = useRef<Promise<boolean> | null>(null)
  const mounted = useRef(true)
  const initialImage = useRef<HTMLImageElement>(null)
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
    openReady.current ??= loadImage(OPEN_SRC, { lowPriority, srcSet: OPEN_SRCSET, sizes: BOOK_SIZES })
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
    let finished = false
    let frame = 0
    const shouldAnimate = () => planBookOpening({
      reducedMotion: prefersReducedMotion(),
      hydrated,
      ...readBookConnection(),
    }) === 'animate'
    if (!shouldAnimate()) {
      showOpen()
      return
    }

    const until = openingDeadline(performance.now())
    const openWithoutAnimation = () => {
      if (cancelled || finished) return
      finished = true
      showOpen()
    }
    const deadline = window.setTimeout(openWithoutAnimation, until - performance.now())

    async function animateIfReady() {
      try {
        await initialImage.current?.decode?.()
        if (cancelled || finished) return
        await new Promise<void>((resolve) => {
          frame = window.requestAnimationFrame(() => {
            frame = window.requestAnimationFrame(() => resolve())
          })
        })
        if (cancelled || finished) return
        if (!shouldAnimate() || performance.now() > until) return openWithoutAnimation()

        const src = await chooseSpriteSrc()
        if (cancelled || finished) return
        if (!shouldAnimate() || performance.now() > until) return openWithoutAnimation()
        if (!(await loadImage(src, { lowPriority: true }))) return openWithoutAnimation()
        if (cancelled || finished) return
        if (!shouldAnimate() || performance.now() > until) return openWithoutAnimation()

        finished = true
        window.clearTimeout(deadline)
        setSpriteSrc(src)
        setPhase('opening')
        loadOpen(true)
      } catch {
        openWithoutAnimation()
      }
    }

    void animateIfReady()
    return () => {
      cancelled = true
      window.clearTimeout(deadline)
      window.cancelAnimationFrame(frame)
    }
  }, [showOpen, loadOpen, hydrated])

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
          ref={initialImage}
          src={phase === 'open' ? OPEN_SRC : CLOSED_SRC}
          srcSet={phase === 'open' ? OPEN_SRCSET : CLOSED_SRCSET}
          sizes={BOOK_SIZES}
          alt="לוגו אוצריא"
          width={560}
          height={560}
          fetchPriority="high"
          className={`size-full ${phase === 'opening' ? 'opacity-0' : ''}`}
        />
        {phase === 'opening' && spriteSrc && (
          <span
            aria-hidden="true"
            className="golden-book-sprite absolute inset-0"
            style={{ backgroundImage: `url('${spriteSrc}')` }}
            onAnimationEnd={onSpriteEnd}
          />
        )}
      </div>
    </div>
  )
}
