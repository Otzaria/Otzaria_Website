'use client'

import { useState } from 'react'
import FullPageDialog from '../../common/FullPageDialog'

// תמונת-שורה מהאתר (נתיב מוגן של הניהול). רוחב מלא עד הגודל המקורי, בלי מתיחה.
export function LineImage({ src, w, h, alt = 'תמונת השורה', className = '' }) {
  return (
    <img
      src={src}
      alt={alt}
      width={w || undefined}
      height={h || undefined}
      loading="lazy"
      className={`block h-auto max-w-full rounded border border-surface-variant bg-white ${className}`}
    />
  )
}

// "הצג בעמוד המלא" בשורת-סקירה (זיהוי ונתב): אותו חלון כמו אצל המתנדב — העמוד, והשורה
// מסומנת בו (ctx.bbox בפיקסלים של תמונת-העמוד). בלי ctx — כלום.
export function ContextButton({ ctx, alias, page }) {
  const [open, setOpen] = useState(false)
  if (!ctx) return null
  return (
    <>
      <button type="button" className="inline-flex items-center gap-0.5 text-xs text-info-700 hover:underline" onClick={() => setOpen(true)}>
        <span className="material-symbols-outlined text-sm">pageview</span>
        הצג בעמוד המלא
      </button>
      {open && <FullPageDialog ctx={ctx} alias={alias} page={page} onClose={() => setOpen(false)} />}
    </>
  )
}
