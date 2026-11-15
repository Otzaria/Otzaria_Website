'use client'

import { useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Dialog from '@/components/ui/Dialog'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { cx } from '@/components/ui/cx'
import { normalizeCropRect } from '@/lib/pageReports/cropRect'
import { cropLayout } from './pageScanCropLayout'

/**
 * רק האזור מצילום העמוד שבו נמצא הטקסט המדווח (cropRect — שברים 0..1, מחושב אוטומטית בעורך בזמן
 * הדיווח). לחיצה פותחת את הצילום המלא. אין אזור / אין כתובת / התמונה לא נטענה — לא מוצג דבר.
 * התמונה כולה נטענת ומוזזת בתוך מסגרת חתוכה (overflow hidden); יחס הרוחב-גובה של המסגרת — לפי
 * הגודל הטבעי של התמונה, אחרי שנטענה (עד אז המסגרת שקופה בגובה משוער).
 * @param {{ imageUrl?: string|null, cropRect?: object|null, alt: string, maxHeightRem?: number }} props
 *   alt — "ספר, עמוד 12" (לשם הנגיש ולכותרת החלון)
 */
export default function PageScanCrop({ imageUrl, cropRect, alt, maxHeightRem = 10 }) {
  const [natural, setNatural] = useState(/** @type {null | { src: string, w: number, h: number }} */ (null))
  const [failed, setFailed] = useState(/** @type {string|null} */ (null))
  const [open, setOpen] = useState(false)
  const rect = normalizeCropRect(cropRect)
  if (!imageUrl || !rect || failed === imageUrl) return null

  const size = natural?.src === imageUrl ? natural : null
  const layout = cropLayout(rect, size)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`הצג את צילום העמוד המלא — ${alt}`}
        className={cx('group relative block w-full overflow-hidden rounded-(--radius-control) border border-outline-variant bg-surface-container-lowest', FOCUS_RING)}
        style={{ maxWidth: `calc(${maxHeightRem}rem * ${layout.aspect})` }}
      >
        {/* כיוון פיזי (ltr) — המיקום של התמונה בתוך המסגרת אינו תלוי בכיוון הדף */}
        <span dir="ltr" data-testid="scan-crop-frame" className="relative block w-full overflow-hidden" style={{ aspectRatio: String(layout.aspect) }}>
          <img
            src={imageUrl}
            alt={`האזור המדווח בצילום — ${alt}`}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth > 0 && img.naturalHeight > 0) setNatural({ src: imageUrl, w: img.naturalWidth, h: img.naturalHeight })
            }}
            onError={() => setFailed(imageUrl)}
            className={cx('absolute max-w-none select-none', size ? 'opacity-100' : 'opacity-0')}
            style={layout.image}
          />
          {layout.mark && (
            <span
              aria-hidden="true"
              data-testid="scan-crop-mark"
              className="pointer-events-none absolute rounded-(--radius-xs) outline-2 outline-offset-2 outline-primary"
              style={layout.mark}
            />
          )}
        </span>
        <span aria-hidden="true" className="absolute bottom-1 start-1 flex size-7 items-center justify-center rounded-(--radius-pill) bg-surface/90 text-on-surface shadow-(--shadow-menu) group-hover:bg-surface">
          <AppIcon name="zoom_in" className="text-icon-sm" />
        </span>
      </button>
      {open && (
        <Dialog title="צילום העמוד" subtitle={alt} onClose={() => setOpen(false)} className="sm:max-w-4xl">
          <img src={imageUrl} alt={`צילום העמוד — ${alt}`} className="block h-auto w-full" />
        </Dialog>
      )}
    </>
  )
}
