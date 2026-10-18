import type { ReactNode } from 'react'
import TitleOrnament from './TitleOrnament'
import { cx } from './cx'

export type HeadingSize = 'lg' | 'md'

const TITLE_SIZE: Record<HeadingSize, string> = {
  // כותרת אזור בדף נחיתה / כותרת עמוד: 1.7rem בנייד, 2.16rem מ-md
  lg: 'text-headline-md md:text-headline-lg',
  // כותרת משנה בתוך עמוד תוכן
  md: 'text-headline-sm'
}

const SPACING = {
  default: 'mb-8 md:mb-10',
  none: ''
} as const

/**
 * כותרת אזור בשפת המתקין: כותרת (גופן התצוגה), קישוט דק (קו + נקודת זהב) ושורת משנה שקטה.
 *
 * as — רמת הכותרת (h1 לכותרת עמוד — או השתמשו ב-PageHeader; h2 לאזור; h3 לתת-אזור).
 *      הרמה סמנטית; הגודל נקבע ב-size, כדי שהיררכיית h1→h2→h3 לא תהיה תלויה במראה.
 * id   — לחיבור aria-labelledby של ה-<section> (ראו ui/Section).
 * spacing — הרווח שמתחת לכותרת. 'none' כשההורה קובע את הרווח (gap) — עדיף על דריסה.
 */
export default function SectionHeading({
  id,
  title,
  subtitle,
  as: Tag = 'h2',
  size = 'lg',
  align = 'center',
  ornament = true,
  spacing = 'default',
  className
}: {
  id?: string
  title: ReactNode
  subtitle?: ReactNode
  as?: 'h1' | 'h2' | 'h3'
  size?: HeadingSize
  align?: 'center' | 'start'
  ornament?: boolean
  spacing?: keyof typeof SPACING
  className?: string
}) {
  const center = align === 'center'
  return (
    <div className={cx('flex flex-col', center ? 'items-center text-center' : 'items-start text-start', SPACING[spacing], className)}>
      {/* עטיפה ברוחב הכותרת — הקישוט נמדד ממנה */}
      <div className="flex w-fit max-w-full flex-col">
        <Tag id={id} className={cx('text-balance font-display text-on-surface', TITLE_SIZE[size])}>
          {title}
        </Tag>
        {ornament && <TitleOrnament className={cx('mt-4', !center && 'ms-0')} />}
      </div>
      {subtitle && (
        <p className="mt-4 max-w-measure text-balance text-base text-on-surface-variant md:text-lg">{subtitle}</p>
      )}
    </div>
  )
}
