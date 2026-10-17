import Link from 'next/link'
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import AppIcon from './AppIcon'
import Loader from './Loader'
import { cx } from './cx'
import {
  buttonClasses,
  buttonIconClasses,
  type ButtonIconSize,
  type ButtonSize,
  type ButtonVariant
} from './buttonStyles'

export type { ButtonVariant, ButtonSize, ButtonIconSize } from './buttonStyles'

/** אייקון: שם גליף של Material Symbols, או אלמנט מוכן (למשל <DonateAnimatedIcon />) */
export type ButtonIcon = string | ReactNode

type CommonProps = {
  children?: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  /** אייקון לפני הטקסט (בצד ההתחלה — ימין ב-RTL) */
  icon?: ButtonIcon
  /** אייקון אחרי הטקסט (חץ, "נפתח בחלון חדש") */
  iconEnd?: ButtonIcon
  /** גודל הגליף; ברירת המחדל לפי size */
  iconSize?: ButtonIconSize
  /** מחלקות נוספות לגליף (למשל variant של מסך: tall:text-[...]) */
  iconClassName?: string
  /** כפתור אייקון בלבד — חובה aria-label */
  iconOnly?: boolean
  fullWidth?: boolean
  loading?: boolean
  disabled?: boolean
  className?: string
}

type AsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined
  }

type AsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps | 'href'> & {
    href: string
    /** נפתח בלשונית חדשה (target=_blank + rel=noopener noreferrer) */
    external?: boolean
    /** prefetch של Next — כבוי כברירת מחדל באתר (ראו OtzariaSoftwareHeader) */
    prefetch?: boolean
  }

export type ButtonProps = AsButton | AsLink

/** עוגן באותו דף, כתובת מלאה, mailto: וכו' — <a> רגיל ולא ניווט של Next */
export function isPlainAnchor(href: string): boolean {
  return href.startsWith('#') || href.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(href)
}

function renderIcon(icon: ButtonIcon, className: string) {
  if (icon == null || icon === false) return null
  if (typeof icon === 'string') return <AppIcon name={icon} className={className} />
  return icon
}

/**
 * כפתור אחד לכל האתר: <button>, קישור פנימי (Next Link, בלי prefetch כברירת מחדל), או <a>
 * לעוגן/כתובת חיצונית — לפי href. מבוסס טוקנים (component-tokens.css → --button-*), ומטרת
 * המגע לפחות 44px בכל הגדלים. Server Component (בלי hooks) — אפשר להשתמש בו גם בדפי שרת.
 *
 * נגישות: loading → aria-busy ו-disabled, ובמקום האייקון מחוון הטעינה (ui/Loader, דקורטיבי); קישור מושבת → aria-disabled ומחוץ לסדר הטאב
 * (קישור אין לו disabled אמיתי); iconOnly דורש aria-label.
 */
export default function Button(props: ButtonProps) {
  const {
    children,
    variant = 'filled',
    size = 'md',
    icon,
    iconEnd,
    iconSize,
    iconClassName,
    iconOnly = false,
    fullWidth = false,
    loading = false,
    disabled = false,
    className,
    ...rest
  } = props

  const inactive = disabled || loading
  const classes = buttonClasses({ variant, size, fullWidth, iconOnly, disabled: inactive, className })
  const iconClasses = cx(buttonIconClasses({ variant, size, iconSize }), iconClassName)
  const content = (
    <>
      {loading
        ? <Loader size="inline" decorative className={variant === 'donation' ? undefined : iconClasses} />
        : renderIcon(icon, iconClasses)}
      {children}
      {renderIcon(iconEnd, iconClasses)}
    </>
  )

  if (rest.href !== undefined) {
    const { href, external = false, prefetch = false, onClick, ...anchorRest } = rest as Omit<AsLink, keyof CommonProps>
    const linkProps = {
      ...anchorRest,
      className: classes,
      'aria-busy': loading || undefined,
      'aria-disabled': inactive || undefined,
      tabIndex: inactive ? -1 : anchorRest.tabIndex,
      onClick: inactive
        ? (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault()
        : onClick,
      ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : null)
    }
    if (external || isPlainAnchor(href)) {
      return <a href={href} {...linkProps}>{content}</a>
    }
    return <Link href={href} prefetch={prefetch} {...linkProps}>{content}</Link>
  }

  const { type = 'button', ...buttonRest } = rest as Omit<AsButton, keyof CommonProps>
  return (
    <button
      {...buttonRest}
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      className={classes}
    >
      {content}
    </button>
  )
}
