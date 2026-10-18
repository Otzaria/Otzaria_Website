import type { HTMLAttributes, ReactNode } from 'react'
import { containerClasses, type ContainerSize } from './Container'
import { cx } from './cx'

/** הריפוד האנכי של אזור: default — מעל ומתחת; top — רק מעל (אזור אחרון לפני הפוטר); none */
const SPACING = {
  default: 'py-14 md:py-20',
  top: 'pt-14 md:pt-20',
  none: ''
} as const

export type SectionSpacing = keyof typeof SPACING

/**
 * אזור בעמוד: <section> עם ריפוד צד (--page-gutter: 4 / מ-md 8 יחידות מרווח) וריפוד אנכי אחיד, ובתוכו מכל
 * ממורכז (ui/Container). הקצב האנכי של כל העמודים נקבע כאן — לא margin בכל רכיב.
 *
 * labelledBy — id של כותרת האזור (aria-labelledby); בלעדיו section אינו landmark בעל שם.
 * anchor     — יעד של קישור עוגן (#download): העצירה מתחת לכותרת הדביקה (.anchor-section).
 * container  — רוחב המכל, או false כשהילדים קובעים רוחב בעצמם.
 * data-spacing — הריפוד שנבחר, לבדיקות ולכלי פיתוח (העיצוב עצמו במחלקות).
 */
export default function Section({
  id,
  labelledBy,
  anchor = false,
  spacing = 'default',
  container = 'content',
  containerClassName,
  className,
  children,
  ...rest
}: {
  id?: string
  labelledBy?: string
  anchor?: boolean
  spacing?: SectionSpacing
  container?: ContainerSize | false
  containerClassName?: string
  className?: string
  children?: ReactNode
} & Omit<HTMLAttributes<HTMLElement>, 'id'>) {
  return (
    <section
      {...rest}
      id={id}
      aria-labelledby={labelledBy}
      data-spacing={spacing}
      className={cx(anchor && 'anchor-section', 'px-(--page-gutter) md:px-(--page-gutter-md)', SPACING[spacing], className)}
    >
      {container === false ? children : <div className={containerClasses(container, containerClassName)}>{children}</div>}
    </section>
  )
}
