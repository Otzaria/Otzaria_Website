'use client'

import { useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'
import FullPageDialog from '../../common/FullPageDialog'

// תמונת-שורה מהאתר (נתיב מוגן של הניהול), על משטח שקט. רוחב מלא עד הגודל המקורי, בלי מתיחה.
// onError — כשהתמונה לא נטענה (קובץ שנמחק, תקלה): השורה מציגה ImageMissing ולא מאפשרת אישור עיוור.
export function LineImage({ src, w, h, alt = 'תמונת השורה', className = '', onError }) {
  return (
    <div className="max-w-full self-start rounded-(--radius-control) bg-surface-container-low p-2">
      <img src={src} alt={alt} width={w || undefined} height={h || undefined} loading="lazy" onError={onError} className={cx('block h-auto max-w-full', className)} />
    </div>
  )
}

// במקום תמונה שלא נטענה: הודעה ברורה במקום מלבן ריק. id — לקשר אליה את כפתור האישור המושבת.
export function ImageMissing({ id, canApprove = true }) {
  return (
    <div id={id} role="status" className="flex max-w-full items-start gap-2 self-start rounded-(--radius-control) bg-warning-container px-3 py-2 text-body-sm text-on-warning-container">
      <AppIcon name="warning" className="mt-0.5 shrink-0 text-icon-lg" />
      <span>
        תמונת השורה לא נטענה.{canApprove ? ' אי אפשר לאשר בלי לראות אותה — אפשר לדחות, או לפתוח את העמוד המלא.' : ''}
      </span>
    </div>
  )
}

// "הצג בעמוד המלא" בשורת-סקירה (זיהוי ונתב): אותו חלון כמו אצל המתנדב — העמוד, והשורה
// מסומנת בו (ctx.bbox בפיקסלים של תמונת-העמוד). בלי ctx — כלום.
export function ContextButton({ ctx, alias, page }) {
  const [open, setOpen] = useState(false)
  if (!ctx) return null
  return (
    <>
      <Button variant="text" size="sm" icon="pageview" onClick={() => setOpen(true)}>
        הצג בעמוד המלא
      </Button>
      {open && <FullPageDialog ctx={ctx} alias={alias} page={page} onClose={() => setOpen(false)} />}
    </>
  )
}
