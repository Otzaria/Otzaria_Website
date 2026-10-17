import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { isPlainAnchor } from './Button'
import { cx } from './cx'
import { FOCUS_RING } from './focusRing'

/**
 * tone — רמת המשטח:
 *   default — AppCard: משטח card, בלי מסגרת ובלי צל (ההפרדה בצבע בלבד).
 *   raised  — כרטיס שצריך להיבדל ממה שמעליו: קו מתאר דק וצל רך.
 *   tonal   — משטח טונלי שקוף-למחצה (הערה, תיבת הסבר).
 * padding — none (הצרכן קובע) / sm / md / lg — מתרחב מעט במסך רחב.
 */
const TONE = {
  default: 'bg-(--card-bg)',
  raised: 'bg-(--card-bg) shadow-(--card-raised-shadow) ring-1 ring-(--card-raised-ring)',
  tonal: 'bg-(--card-bg-tonal)'
} as const

const PADDING = {
  none: '',
  sm: 'p-3 sm:p-4',
  md: 'p-4 sm:p-5 xl:p-6',
  lg: 'p-6 sm:p-8'
} as const

export type CardTone = keyof typeof TONE
export type CardPadding = keyof typeof PADDING

const INTERACTIVE = cx('group text-start transition-colors hover:bg-(--card-bg-hover)', FOCUS_RING)

export function cardClasses({ tone = 'default', padding = 'none', interactive = false, className }: {
  tone?: CardTone
  padding?: CardPadding
  interactive?: boolean
  className?: string
} = {}) {
  return cx('rounded-(--card-radius)', TONE[tone], PADDING[padding], interactive && INTERACTIVE, className)
}

type CommonProps = {
  tone?: CardTone
  padding?: CardPadding
  className?: string
  children?: ReactNode
}

type StaticCard = CommonProps & HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'li' | 'article' | 'section' | 'aside'
  href?: undefined
  onClick?: undefined
}
type LinkCard = CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
  external?: boolean
  prefetch?: boolean
}
type ButtonCard = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  href?: undefined
  onClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
}

export type CardProps = StaticCard | LinkCard | ButtonCard

/**
 * כרטיס — משטח מעוגל. סטטי (div/li/article...) או אינטראקטיבי: href → קישור (Next Link בלי
 * prefetch; <a> לכתובת מלאה/עוגן), onClick → <button>. כרטיס אינטראקטיבי כולו מטרת המגע:
 * ריחוף (card-selected), טבעת פוקוס, ומחלקת group — כדי שפעולה בתוכו (group-hover:) תגיב יחד.
 * אסור לשים בתוכו קישור או כפתור נוסף (אלמנט אינטראקטיבי מקונן).
 * data-tone / data-interactive — המצב שהרכיב בחר, לבדיקות ולכלי פיתוח (לא לעיצוב: הוא במחלקות).
 */
export default function Card(props: CardProps) {
  const { tone, padding, className, children } = props
  const data = (interactive: boolean) => ({ 'data-tone': tone ?? 'default', 'data-interactive': interactive ? '' : undefined })

  if (props.href !== undefined) {
    const { href, external = false, prefetch = false, tone: _t, padding: _p, className: _c, children: _ch, ...rest } = props
    const classes = cardClasses({ tone, padding, interactive: true, className })
    const extra = external ? { target: '_blank', rel: 'noopener noreferrer' } : null
    if (external || isPlainAnchor(href)) return <a {...rest} {...extra} {...data(true)} href={href} className={classes}>{children}</a>
    return <Link {...rest} {...extra} {...data(true)} href={href} prefetch={prefetch} className={classes}>{children}</Link>
  }

  if (props.onClick) {
    const { tone: _t, padding: _p, className: _c, children: _ch, type = 'button', ...rest } = props as ButtonCard
    return <button {...rest} {...data(true)} type={type} className={cardClasses({ tone, padding, interactive: true, className })}>{children}</button>
  }

  const { as: Tag = 'div', tone: _t, padding: _p, className: _c, children: _ch, ...rest } = props as StaticCard
  return <Tag {...rest} {...data(false)} className={cardClasses({ tone, padding, className })}>{children}</Tag>
}
