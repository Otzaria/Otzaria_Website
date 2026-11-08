'use client'

import Thumb from '@/components/ui/Thumb'
import { cx } from '@/components/ui/cx'

const SIZES = {
  sm: { box: 'size-10', icon: 'text-icon-lg', px: 40 },
  lg: { box: 'size-16', icon: 'text-icon-2xl', px: 64 },
}

/**
 * התמונה של תוסף, ממוזערת — ui/Thumb בגוון "אריח". אין תמונה, או שלא נטענה — אריח אייקון באותה מידה, כדי
 * שהשמות יישארו באותו קו. בעדכון שממתין — התמונה שהוגשה (pending=1).
 * hasImage — כשבנתונים אין image.ext (רשימות הסידור יודעות רק אם יש תמונה).
 * @param {{ plugin: any, pending?: boolean, hasImage?: boolean, size?: 'sm' | 'lg', className?: string }} props
 */
export default function PluginThumb({ plugin, pending = false, hasImage, size = 'sm', className }) {
  const s = SIZES[size]
  const source = pending && plugin?.pendingUpdate ? plugin.pendingUpdate : plugin
  const src = (hasImage ?? source?.image?.ext) ? `/api/plugins/${plugin._id}/image${pending && plugin.pendingUpdate ? '?pending=1' : ''}` : null
  return (
    <Thumb src={src} icon="extension" tone="tile" className={cx(s.box, className)} iconClassName={s.icon} width={s.px} height={s.px} />
  )
}
