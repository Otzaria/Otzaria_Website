'use client'

import Thumb from '@/components/ui/Thumb'
import { cx } from '@/components/ui/cx'

const SIZES = {
  sm: { box: 'h-12 w-9', icon: 'text-icon-lg', px: 36 },
  lg: { box: 'h-23 w-16', icon: 'text-icon-2xl', px: 64 },
}

/**
 * הכריכה של ספר (העמוד הראשון), ממוזערת — ui/Thumb בגוון "כריכה". אין תמונה או שהיא לא נטענה — ממלא מקום
 * באותה מידה בדיוק, כדי שהשמות יישארו באותו קו.
 * @param {{ src?: string | null, size?: 'sm' | 'lg', className?: string }} props
 */
export default function BookThumb({ src, size = 'sm', className }) {
  const s = SIZES[size]
  return <Thumb src={src} icon="menu_book" tone="cover" className={cx(s.box, className)} iconClassName={s.icon} width={s.px} />
}
