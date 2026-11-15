'use client'

import { useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Dialog from '@/components/ui/Dialog'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { cx } from '@/components/ui/cx'

/**
 * צילום העמוד: תמונה מוקטנת שנפתחת בחלון בגודל מלא — כדי להשוות את הטקסט לספר עצמו. אין כתובת, או שהתמונה לא
 * נטענה — שורה שקטה "אין צילום" (בלי מסגרת ריקה).
 * @param {{ src?: string | null, name: string }} props name — "ספר, עמוד 12" (לחלון ולשם הנגיש)
 */
export default function PageImage({ src, name }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(null)
  if (!src || failed === src) {
    return (
      <p className="flex items-center gap-1 text-body-sm text-on-surface-variant">
        <AppIcon name="image" className="text-icon-md" />
        אין צילום של העמוד
      </p>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`הגדל את צילום העמוד — ${name}`}
        className={cx('group relative block w-fit overflow-hidden rounded-(--radius-control) border border-outline-variant bg-surface-container-lowest', FOCUS_RING)}
      >
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} className="block max-h-44 w-auto max-w-full md:max-w-40" />
        <span aria-hidden="true" className="absolute bottom-1 start-1 flex size-8 items-center justify-center rounded-(--radius-pill) bg-surface/90 text-on-surface shadow-(--shadow-menu) group-hover:bg-surface">
          <AppIcon name="zoom_in" className="text-icon-md" />
        </span>
      </button>
      {open && (
        <Dialog title="צילום העמוד" subtitle={name} onClose={() => setOpen(false)} className="sm:max-w-4xl">
          <img src={src} alt={`צילום העמוד — ${name}`} className="block h-auto w-full" />
        </Dialog>
      )}
    </>
  )
}
