import { cx } from './cx'
import { FOCUS_RING } from './focusRing'

/**
 * מפת הסגנונות של ui/Button — לוגיקה טהורה (בלי React), כדי שאפשר יהיה:
 * 1. לבדוק אותה בנפרד (buttonStyles.test.ts);
 * 2. להחיל מראה של כפתור על אלמנט שכבר אינטראקטיבי בעצמו — למשל ה"כפתור" שבסוף כרטיס-קישור
 *    (DownloadOptionCard), שאסור שיהיה <button> בתוך <a>.
 *
 * וריאנטים (Material 3):
 *   filled   — הפעולה הראשית במסך (אחת לאזור).
 *   tonal    — פעולה משנית חשובה (secondaryContainer).
 *   outlined — פעולה משנית רגילה.
 *   text     — פעולה שקטה / קישור-פעולה.
 *   danger   — פעולה הרסנית (מחיקה, איפוס) — בצבע השגיאה.
 *   donation — כפתור התרומה הטונלי של המותג. ממומש ב-.donation-button (effects.css), כי הוא
 *              משותף גם לכותרת (DonationButton) — כאן רק הבחירה במחלקה ובגודל.
 */

export const BUTTON_VARIANTS = ['filled', 'tonal', 'outlined', 'text', 'danger', 'donation'] as const
export const BUTTON_SIZES = ['sm', 'md', 'lg', 'header'] as const

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]
export type ButtonSize = (typeof BUTTON_SIZES)[number]

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-(--button-radius) font-semibold transition-colors ' + FOCUS_RING

const VARIANT: Record<Exclude<ButtonVariant, 'donation'>, string> = {
  filled:
    'bg-(--button-filled-bg) text-(--button-filled-fg) hover:bg-(--button-filled-bg-hover) active:bg-(--button-filled-bg-pressed)',
  tonal: 'bg-(--button-tonal-bg) text-(--button-tonal-fg) hover:bg-(--button-tonal-bg-hover)',
  outlined:
    'border border-(--button-outlined-border) text-(--button-outlined-fg) hover:bg-(--button-outlined-bg-hover)',
  text: 'text-(--button-text-fg) hover:bg-(--button-text-bg-hover)',
  danger: 'bg-(--button-danger-bg) text-(--button-danger-fg) hover:bg-(--button-danger-bg-hover)'
}

/**
 * מטרת מגע של 44px לכפתור שגובהו החזותי נמוך ממנה (header): שכבה שקופה ב-::before, ממורכזת
 * אנכית, בגובה max(100%, 44px) — כמו .donation-nav-link שלצדו בכותרת.
 */
const TOUCH_TARGET_OVERLAY =
  "relative before:absolute before:inset-x-0 before:top-1/2 before:h-[max(100%,var(--touch-target))] before:-translate-y-1/2 before:content-['']"

/** גובה (מטרת מגע ≥44px בכל הגדלים — ב-header דרך ::before), ריפוד וגודל טקסט */
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-(--button-height-sm) px-4 text-sm',
  md: 'min-h-(--button-height-md) px-6 text-base',
  lg: 'min-h-(--button-height-lg) px-8 text-base',
  header: `min-h-(--button-height-header) px-3.5 text-sm whitespace-nowrap ${TOUCH_TARGET_OVERLAY}`
}

/** כפתור אייקון בלבד — ריבוע ברוחב הגובה */
const ICON_ONLY: Record<ButtonSize, string> = {
  sm: 'min-h-(--button-height-sm) min-w-(--button-height-sm) text-sm',
  md: 'min-h-(--button-height-md) min-w-(--button-height-md) text-base',
  lg: 'min-h-(--button-height-lg) min-w-(--button-height-lg) text-base',
  header: `min-h-(--button-height-header) min-w-(--button-height-header) text-sm ${TOUCH_TARGET_OVERLAY}`
}

/** גודל הגליף — ברירת המחדל לפי גודל הכפתור */
export type ButtonIconSize = ButtonSize

const ICON_SIZE: Record<ButtonIconSize, string> = {
  sm: 'text-(length:--button-icon-size-sm)',
  md: 'text-(length:--button-icon-size-md)',
  lg: 'text-(length:--button-icon-size-lg)',
  header: 'text-(length:--button-icon-size-header)'
}

export const DISABLED_CLASSES = 'pointer-events-none opacity-(--button-disabled-opacity)'

export type ButtonStyleOptions = {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  iconOnly?: boolean
  disabled?: boolean
  className?: string
}

export function buttonClasses({
  variant = 'filled',
  size = 'md',
  fullWidth = false,
  iconOnly = false,
  disabled = false,
  className
}: ButtonStyleOptions = {}): string {
  if (variant === 'donation') {
    // הגודל, הצבעים והפוקוס — ב-.donation-button עצמו
    return cx('donation-button', size === 'lg' && 'donation-button-lg', fullWidth && 'w-full', disabled && DISABLED_CLASSES, className)
  }
  return cx(
    BASE,
    VARIANT[variant],
    iconOnly ? ICON_ONLY[size] : SIZE[size],
    fullWidth && 'w-full',
    disabled && DISABLED_CLASSES,
    className
  )
}

export function buttonIconClasses({ variant = 'filled', size = 'md', iconSize }: {
  variant?: ButtonVariant
  size?: ButtonSize
  iconSize?: ButtonIconSize
} = {}): string {
  if (variant === 'donation') return 'donation-button-icon'
  return ICON_SIZE[iconSize ?? size]
}
