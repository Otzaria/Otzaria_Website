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
export const BUTTON_SIZES = ['sm', 'md', 'lg', 'header', 'tool'] as const

export type ButtonVariant = (typeof BUTTON_VARIANTS)[number]
export type ButtonSize = (typeof BUTTON_SIZES)[number]

const BASE = 'inline-flex items-center justify-center gap-2 transition-colors ' + FOCUS_RING

/** רדיוס: רדיוס הפקד בכל הגדלים; tool (כלי העורך) — גלולה, כדי לשבת יפה בתוך גלולת הקבוצה */
const RADIUS = (size: ButtonSize) => (size === 'tool' ? 'rounded-(--button-radius-tool)' : 'rounded-(--button-radius)')

/**
 * משקל הטקסט: semibold בכל הגדלים. tool (כלי העורך, סגנון "אוורירי וקל") — רגיל, כדי שרק
 * "הדגשה" תיראה מודגשת; הפעולה הראשית (filled) בשורת העורך — medium.
 */
const WEIGHT = (size: ButtonSize, variant: ButtonVariant) =>
  size === 'tool' ? (variant === 'filled' ? 'font-medium' : 'font-normal') : 'font-semibold'

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
 * כלי עורך שקט (variant="text" size="tool"): אייקון רך (on-surface-variant) וריחוף עדין.
 * --tool-bg-hover מוחלף בתוך גלולת קבוצה (PaneToolbar) לגוון כהה יותר.
 */
const TOOL_TEXT = 'text-(--tool-fg) hover:bg-(--tool-bg-hover)'

/** מצב לחוץ/פעיל (aria-pressed) של כפתור שקט: מילוי secondary-container רך */
const PRESSED = 'bg-(--tool-bg-pressed) text-(--tool-fg-pressed) hover:bg-(--tool-bg-pressed-hover)'

function variantClasses(variant: Exclude<ButtonVariant, 'donation'>, size: ButtonSize, pressed: boolean): string {
  if (variant === 'text' && pressed) return PRESSED
  if (variant === 'text' && size === 'tool') return TOOL_TEXT
  return VARIANT[variant]
}

/**
 * מטרת מגע של 44px לכפתור שגובהו החזותי נמוך ממנה (header): שכבה שקופה ב-::before, ממורכזת
 * אנכית, בגובה max(100%, 44px) — כמו .donation-nav-link שלצדו בכותרת.
 */
export const TOUCH_TARGET_OVERLAY =
  "relative before:absolute before:inset-x-0 before:top-1/2 before:h-[max(100%,var(--touch-target))] before:-translate-y-1/2 before:content-['']"

/** גובה (מטרת מגע ≥44px בכל הגדלים — ב-header וב-tool, כפתור כלי העורך, דרך ::before), ריפוד וגודל טקסט */
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-(--button-height-sm) px-4 text-sm',
  md: 'min-h-(--button-height-md) px-6 text-base',
  lg: 'min-h-(--button-height-lg) px-8 text-base',
  header: `min-h-(--button-height-header) px-3.5 text-sm whitespace-nowrap ${TOUCH_TARGET_OVERLAY}`,
  tool: `min-h-(--button-height-tool) px-4 text-sm whitespace-nowrap ${TOUCH_TARGET_OVERLAY}`
}

/** כפתור אייקון בלבד — ריבוע ברוחב הגובה */
const ICON_ONLY: Record<ButtonSize, string> = {
  sm: 'min-h-(--button-height-sm) min-w-(--button-height-sm) text-sm',
  md: 'min-h-(--button-height-md) min-w-(--button-height-md) text-base',
  lg: 'min-h-(--button-height-lg) min-w-(--button-height-lg) text-base',
  header: `min-h-(--button-height-header) min-w-(--button-height-header) text-sm ${TOUCH_TARGET_OVERLAY}`,
  tool: `min-h-(--button-height-tool) min-w-(--button-height-tool) text-sm ${TOUCH_TARGET_OVERLAY}`
}

/** גודל הגליף — ברירת המחדל לפי גודל הכפתור */
export type ButtonIconSize = ButtonSize

const ICON_SIZE: Record<ButtonIconSize, string> = {
  sm: 'text-(length:--button-icon-size-sm)',
  md: 'text-(length:--button-icon-size-md)',
  lg: 'text-(length:--button-icon-size-lg)',
  header: 'text-(length:--button-icon-size-header)',
  // אייקון דק (משקל 300; גופן האייקונים משתנה בציר wght — scripts/build-icon-font.mjs)
  tool: 'text-(length:--button-icon-size-tool) font-(--tool-icon-weight)'
}

export const DISABLED_CLASSES = 'pointer-events-none opacity-(--button-disabled-opacity)'

export type ButtonStyleOptions = {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  iconOnly?: boolean
  disabled?: boolean
  /** מצב לחוץ (aria-pressed) — רק ל-variant="text" */
  pressed?: boolean
  className?: string
}

export function buttonClasses({
  variant = 'filled',
  size = 'md',
  fullWidth = false,
  iconOnly = false,
  disabled = false,
  pressed = false,
  className
}: ButtonStyleOptions = {}): string {
  if (variant === 'donation') {
    // הגודל, הצבעים והפוקוס — ב-.donation-button עצמו
    return cx('donation-button', size === 'lg' && 'donation-button-lg', fullWidth && 'w-full', disabled && DISABLED_CLASSES, className)
  }
  return cx(
    BASE,
    RADIUS(size),
    WEIGHT(size, variant),
    variantClasses(variant, size, pressed),
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
