import AppIcon from './AppIcon'
import { TOUCH_TARGET_OVERLAY } from './buttonStyles'
import { cx } from './cx'
import { FOCUS_RING } from './focusRing'

/**
 * כפתור פתיחה של שורה ברשימה — צ'יפ שקט עם חץ ("91 עמודים ⌄"): בלי קו תחתון ובלי סיבוב (המשתמש:
 * "לא יפה"); פתוח — רקע טונלי וחץ למעלה. aria-expanded / aria-controls; מטרת מגע 44px בלי להגדיל
 * את השורה (TOUCH_TARGET_OVERLAY). מוצג רק בשורה שיש בה מה לפתוח — שורה אחרת לא זזה.
 * משותף להעלאות (UploadMeta) ולהתנגשויות בסנכרון.
 *
 * @param {{ label: import('react').ReactNode, expanded: boolean, controls?: string, onToggle: () => void,
 *   ariaLabel?: string, className?: string }} props
 */
export default function ExpandToggle({ label, expanded, controls, onToggle, ariaLabel, className }) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={cx(
        'inline-flex items-center gap-0.5 rounded-(--radius-pill) py-0.5 pe-1.5 ps-2.5 text-label-md transition-colors',
        expanded
          ? 'bg-secondary-container text-on-secondary-container hover:bg-secondary-container-hover'
          : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
        TOUCH_TARGET_OVERLAY,
        FOCUS_RING,
        className
      )}
    >
      {label}
      <AppIcon name={expanded ? 'expand_less' : 'expand_more'} className="text-icon-md" />
    </button>
  )
}
