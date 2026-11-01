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

/** iconOnly חייב שם נגיש — aria-label או aria-labelledby (אכיפה בזמן הידור) */
type IconOnlyName =
  | { iconOnly?: false }
  | { iconOnly: true; 'aria-label': string }
  | { iconOnly: true; 'aria-labelledby': string }

export type ButtonProps = (AsButton | AsLink) & IconOnlyName

/** עוגן באותו דף, כתובת מלאה, mailto: וכו' — <a> רגיל ולא ניווט של Next */
export function isPlainAnchor(href: string): boolean {
  return href.startsWith('#') || href.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(href)
}

const SAFE_ANCHOR_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * הקשחת href: כתובת עם scheme מותרת רק ב-http:, https:, mailto:, tel:. כל scheme אחר
 * (javascript:, data:, vbscript: ...) מוחזר כ-undefined — הקורא לא מרנדר קישור פעיל.
 * דפדפנים מתעלמים מרווחים/תווי בקרה (כולל TAB ו-LF) בתחילת הכתובת ובתוך ה-scheme,
 * ולכן הבדיקה נעשית על גרסה מנורמלת בלי תווי בקרה ורווחים. נתיבים יחסיים, # ו-// עוברים כמו שהם.
 */
export function safeHref(href: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const match = /^([a-z][a-z\d+.-]*:)/i.exec(href.replace(/[\u0000- ]/g, ''))
  if (match && !SAFE_ANCHOR_SCHEMES.has(match[1].toLowerCase())) return undefined
  return href
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
  // מצב לחוץ — נגזר מ-aria-pressed (מקור אמת אחד למראה ולקורא המסך)
  const ariaPressed = (rest as { 'aria-pressed'?: unknown })['aria-pressed']
  const pressed = ariaPressed === true || ariaPressed === 'true'
  const classes = buttonClasses({ variant, size, fullWidth, iconOnly, disabled: inactive, pressed, className })
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
    const safe = safeHref(href)
    // scheme מסוכן (javascript: וכו') — לא קישור פעיל: <a> בלי href, מושבת ומחוץ לסדר הטאב
    if (safe === undefined) {
      return <a {...linkProps} aria-disabled tabIndex={-1} onClick={(event: MouseEvent<HTMLAnchorElement>) => event.preventDefault()}>{content}</a>
    }
    if (external || isPlainAnchor(safe)) {
      return <a href={safe} {...linkProps}>{content}</a>
    }
    return <Link href={safe} prefetch={prefetch} {...linkProps}>{content}</Link>
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
