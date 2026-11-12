'use client'

import { useState } from 'react'
import AppIcon from './AppIcon'
import { cx } from './cx'
import { THUMB_TONES, thumbFrameClass } from './thumbStyles'

/**
 * תמונה ממוזערת עם ממלא מקום: אין src, או שהתמונה לא נטענה — אייקון באותה מידה בדיוק, כדי שהשמות לידה יישארו
 * באותו קו. דקורטיבית (alt ריק): השם כתוב לידה. <img> רגיל ולא next/image — תמונה של עשרות פיקסלים, בלי
 * עיבוד בשרת לכל שורה. כשה-src מתחלף — מנסה שוב (כשל של תמונה קודמת לא נשאר).
 * תמונה שנכשלה עוד לפני ההידרציה (ה-HTML מהשרת נטען לפני ש-onError חובר) — מזוהה כשהיא מתחברת (complete בלי
 * מידות), אחרת היה נשאר סמל "תמונה שבורה" של הדפדפן.
 *
 * @param {{ src?: string | null, icon: string, tone?: keyof typeof THUMB_TONES, className?: string,
 *   iconClassName?: string, width?: number, height?: number }} props
 * className — המידה של המסגרת; width/height — רמז למידה של התמונה (נגד קפיצה).
 */
export default function Thumb({ src, icon, tone = 'cover', className, iconClassName, width, height }) {
  const [failedSrc, setFailedSrc] = useState(null)
  const detectEarlyFailure = (img) => {
    if (img && img.complete && img.naturalWidth === 0 && img.currentSrc) setFailedSrc(src)
  }
  return (
    <span className={thumbFrameClass(tone, className)}>
      {src && failedSrc !== src ? (
        <img
          ref={detectEarlyFailure}
          src={src}
          alt=""
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className={cx('size-full', THUMB_TONES[tone].image)}
        />
      ) : (
        <AppIcon name={icon} className={iconClassName} />
      )}
    </span>
  )
}
