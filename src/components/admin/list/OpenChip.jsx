import AppIcon from '@/components/ui/AppIcon'
import { TOUCH_TARGET_OVERLAY } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'

/**
 * "פתח" בשורה של רשימת ניהול — צ'יפ שקט עם חץ לכיוון המגירה (המשתמש: "כפתור פתיחה = צ'יפ שקט"), אותו
 * מראה בכל המסכים (ספרים, תוספים, משתמשים). כמו ui/ExpandToggle (הצ'יפ של ההעלאות, ששם הטקסט הוא הספירה),
 * בלי להגדיל את השורה: מטרת מגע 44px דרך TOUCH_TARGET_OVERLAY.
 *
 * decorative — כשבשורה כבר יש כפתור נגיש שפותח (השם): הצ'יפ רק לעכבר ולאצבע, מחוץ לסדר ה-Tab ולקורא
 * המסך. אחרת — כפתור רגיל, ו-label הוא השם הנגיש ("פתח את חוות דעת").
 *
 * @param {{ onClick: () => void, label: string, decorative?: boolean, disabled?: boolean, className?: string }} props
 */
export default function OpenChip({ onClick, label, decorative = false, disabled = false, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      tabIndex={decorative ? -1 : undefined}
      title={decorative ? label : undefined}
      className={cx(
        'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-(--radius-pill) bg-surface-container py-0.5 pe-1.5 ps-2.5 text-label-md text-on-surface transition-colors',
        'hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-(--button-disabled-opacity) disabled:hover:bg-surface-container',
        TOUCH_TARGET_OVERLAY,
        FOCUS_RING,
        className
      )}
    >
      פתח
      <AppIcon name="chevron_left" className="text-icon-md" />
    </button>
  )
}
