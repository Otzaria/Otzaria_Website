'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { preload } from 'react-dom'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import { chooseSpriteSrc, openingDeadline, planBookOpening, readSaveData, SPRITE_PRELOAD_MEDIA } from './goldenBookPlan'
import { BOOK_SIZES, CLOSED_SRC, CLOSED_SRCSET, OPEN_SRC, OPEN_SRCSET, SPRITE_AVIF_SRC } from './goldenBookAssets'

// הספר המוזהב של אוצריא נפתח בתוך הילה חמה — גיבור דף הבית (מהמתקין: GLOW #E9B96A
// ו-24 פריימי הפתיחה של download-assistant, מהם נשארו 12 — כל פריים שני — להקטנת ההורדה והזיכרון).
//
// רצף התצוגה:
// 1. ה-HTML מהשרת מכיל את הפריים הראשון — הספר הסגור (golden-book-closed.v2-*.webp, ~10–20KB, תמונת
//    ה-LCP) — כך שהפתיחה מתחילה ממנו ואין "פתוח → נסגר → נפתח".
// 2. באותו HTML יש preload לרצועה (AVIF, ~80KB) ולספר הפתוח (~17–36KB), שניהם ב-fetchPriority נמוך —
//    כך שהם יורדים במקביל ל-JS ולא מתחרים ב-LCP ובגופנים. ה-preload של הרצועה מסונן ב-media
//    (SPRITE_PRELOAD_MEDIA): עם prefers-reduced-motion הדפדפן לא מוריד אותה בכלל. הספר הפתוח
//    מוצג בסוף בכל המסלולים, כך שהורדתו אינה בזבוז; ברשת איטית הוא כבר מוכן כשמוותרים על
//    האנימציה. עם חיסכון בנתונים הרצועה כן יורדת (אין לזה media — ראו goldenBookPlan.ts) אבל
//    לא מנוגנת.
// 3. אחרי ה-hydration מחליטים אם לנגן (planBookOpening): עם prefers-reduced-motion, חיסכון
//    בנתונים, או כשהרכיב עלה בניווט צד-לקוח ולא ב-hydration — עוברים לספר הפתוח.
// 4. אחרת מחכים לפענוח הרצועה (new Image, שמשתמש בהורדה של ה-preload). אם היא מוכנה עד
//    OPEN_WAIT_MS מרגע ה-hydration — מנגנים פעם אחת (1 שנייה, 12fps). אם לא (רשת או מכשיר
//    איטיים), או שהטעינה נכשלה — מציגים את הספר הפתוח בלי אנימציה, כדי שאף אחד לא יעמוד מול
//    ספר סגור.
// 5. בסוף הרצועה עוברים לתמונת הספר הפתוח (golden-book.v2-*.webp, 560px — חדה יותר מפריים
//    הרצועה, 360px), אחרי פענוח, כך שאין הבהוב.
//
// onOpened — נקרא פעם אחת כשהספר פתוח (סוף הרצועה, או במסלולי הגיבוי), כדי שמה שבא אחריו
// (ForeverTagline) יתחיל בדיוק כשהפתיחה נגמרת.
//
// בניווט צד-לקוח אל דף הבית (חזרה מדף אחר) הרכיב לא עולה ב-hydration, ולכן האנימציה לא
// מתנגנת והספר עובר ישר לפתוח — בכוונה: מי שחוזר לדף כבר ראה אותה. גם ה-preload נקרא רק
// ברינדור השרת, כדי שניווט כזה לא יוריד רצועה שלא תנוגן.

// הנתיבים ב-goldenBookAssets.ts. chooseSpriteSrc בוחר את הרצועה (AVIF, או WebP בדפדפן בלי AVIF),
// והיא משמשת גם לפענוח המוקדם וגם ל-background-image (inline style) — אותו קובץ, בלי הורדה כפולה.
// גודל הפריים, מספר הפריימים והאנימציה — ב-animations.css (.golden-book-sprite).

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
    // type: דפדפן בלי AVIF מדלג על ה-preload (ויורד ל-WebP רק אם יצליח לנגן בזמן, ראו chooseSpriteSrc)
    preload(SPRITE_AVIF_SRC, { as: 'image', type: 'image/avif', fetchPriority: 'low', media: SPRITE_PRELOAD_MEDIA })
  }
  const hydrated = useMountedByHydration()
  const [phase, setPhase] = useState<Phase>('closed')
  const [spriteSrc, setSpriteSrc] = useState<string | null>(null)
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
    if (planBookOpening({ reducedMotion: prefersReducedMotion(), saveData: readSaveData(), hydrated }) === 'static') {
      showOpen()
      return () => { cancelled = true }
    }
    // אם הרצועה לא מוכנה עד המועד (OPEN_WAIT_MS מעכשיו — רגע ה-hydration) — לא מחכים לה
    const until = openingDeadline(performance.now())
    const deadline = window.setTimeout(() => { if (!cancelled) showOpen() }, until - performance.now())
    // בחירת הפורמט (AVIF/WebP) לוקחת כמה אלפיות שנייה; ה-preload ב-HTML כבר מוריד את ה-AVIF
    chooseSpriteSrc()
      .then((src) => {
        const sprite = new Image()
        sprite.src = src
        // decode() מבטיח שאין הבהוב של אלמנט ריק בזמן ההחלפה
        return sprite.decode().then(() => src)
      })
      .then((src) => {
        if (cancelled || performance.now() > until) return
        window.clearTimeout(deadline)
        setSpriteSrc(src)
        setPhase('opening')
        // התמונה הסופית — ברקע, בזמן שהרצועה מתנגנת
        loadOpen(true)
      })
      .catch(() => { if (!cancelled) showOpen() })
    return () => {
      cancelled = true
      window.clearTimeout(deadline)
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
