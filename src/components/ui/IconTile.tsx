import type { ReactNode } from 'react'
import AppIcon from './AppIcon'
import { cx } from './cx'

/** גודל האריח וגודל הגליף (component-tokens.css → --icon-size-*) */
const SIZES = {
  sm: 'size-10 text-(length:--icon-size-sm)',
  md: 'size-12 text-(length:--icon-size-md)',
  lg: 'size-14 text-(length:--icon-size-lg)'
} as const

/** tone — secondary: האריח הטונלי של האפליקציה (ברירת מחדל); primary: מלא, להדגשה נדירה */
const TONES = {
  secondary: 'bg-(--icon-tile-bg) text-(--icon-tile-fg)',
  primary: 'bg-primary text-on-primary'
} as const

export type IconTileSize = keyof typeof SIZES
export type IconTileTone = keyof typeof TONES

/**
 * אריח אייקון — כמו באפליקציה ובמסכי המתקין: ריבוע מעוגל טונלי ובו גליף.
 * icon — שם גליף (Material Symbols), או custom — אייקון מותאם (AppIcon), או children (SVG מוכן).
 * דקורטיבי בלבד (aria-hidden): המשמעות תמיד בטקסט שלצדו.
 */
export default function IconTile({ icon, custom, size = 'sm', tone = 'secondary', className, children }: {
  icon?: string
  custom?: 'donate'
  size?: IconTileSize
  tone?: IconTileTone
  className?: string
  children?: ReactNode
}) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-flex shrink-0 items-center justify-center rounded-(--icon-tile-radius)', TONES[tone], SIZES[size], className)}
    >
      {children ?? <AppIcon name={icon} custom={custom} className="[font-size:inherit]" />}
    </span>
  )
}
