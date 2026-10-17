'use client'

import { useCallback, useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import Loader from '@/components/ui/Loader'
import { cx } from '@/components/ui/cx'

/** טופס התרומה של נדרים פלוס — הכתובת והגובה כמו שהיו בדף (ה-CSP ב-next.config מתיר את nedar.im) */
export const NEDARIM_WIDGET_SRC = 'https://nedar.im/ezOd'
export const NEDARIM_WIDGET_HEIGHT = '1700px'

/** אחרי כמה זמן מסירים את מחוון הטעינה גם אם אירוע load לא הגיע (חסימה, רשת איטית) */
const LOADER_FALLBACK_MS = 15000

/**
 * מסגרת טופס התרומה: כרטיס מורם, שורת כותרת (אייקון התרומה + "התרומה באמצעות נדרים פלוס"),
 * ומתחתיה ה-iframe — בדיוק כמו קודם (src, title, רוחב מלא, 1700px, בלי מסגרת).
 *
 * בלי קפיצת תוכן: הגובה שמור מראש (העטיפה בגובה ה-iframe). מחוון הטעינה (ui/Loader) יושב
 * *מאחורי* ה-iframe, בראש האזור: כל עוד ה-iframe ריק (שקוף) רואים אותו, וכשהטופס מצויר הוא
 * מכסה אותו — כך זה עובד גם בלי JS, וה-iframe עצמו אף פעם לא מוסתר. ב-JS המחוון גם יורד מה-DOM
 * כשה-iframe נטען (שלא יוכרז לקורא מסך לשווא). אם ה-iframe נטען לפני ההידרציה, אירוע load כבר
 * עבר — לכן ב-ref callback בודקים: מסמך חוצה-מקור (contentDocument === null / חריגה) = הטופס כבר הגיע.
 */
export default function DonateWidget({ title, className }: { title: string; className?: string }) {
  const [loaded, setLoaded] = useState(false)

  // ה-iframe התחבר ל-DOM (בהידרציה — אולי אחרי שכבר נטען): מסמך חוצה-מקור = הטופס כבר הגיע.
  // (המסמך נעשה חוצה-מקור כבר בתחילת הניווט ל-nedar.im, מעט לפני load — אז המחוון עלול לרדת
  // רגע לפני שהטופס מצויר. לא מזיק: ה-iframe לעולם לא מוסתר, והגובה שמור.)
  const checkFrame = useCallback((frame: HTMLIFrameElement | null) => {
    if (!frame) return
    try {
      if (frame.contentDocument === null) setLoaded(true)
    } catch {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setLoaded(true), LOADER_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Card tone="raised" className={cx('overflow-hidden', className)}>
      <div className="flex items-center justify-center gap-3 border-b border-outline-variant px-4 py-4 sm:px-6">
        <IconTile custom="donate" size="sm" />
        <p className="text-title-md text-on-surface">{title}</p>
      </div>
      <div className="relative" style={{ minHeight: NEDARIM_WIDGET_HEIGHT }} data-loaded={loaded ? '' : undefined}>
        {!loaded && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-16">
            <Loader size="lg" />
          </div>
        )}
        <iframe
          ref={checkFrame}
          src={NEDARIM_WIDGET_SRC}
          style={{ width: '100%', height: NEDARIM_WIDGET_HEIGHT, border: 'none' }}
          title="Nedarim Plus Widget"
          onLoad={() => setLoaded(true)}
          className="relative block"
        />
      </div>
    </Card>
  )
}
