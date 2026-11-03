import { cx } from './cx'

/**
 * צירוף מקשים לתצוגה ("Ctrl" "K"). keys — מערך שמות מקשים. כל מקש ב-<kbd> נפרד, והכול
 * עטוף ב-<kbd> חיצוני (הסמנטיקה של HTML לצירוף מקשים). כיוון LTR — "Ctrl K" ולא "K Ctrl".
 * דקורטיבי כשהקיצור כבר נאמר בשם הנגיש של הפעולה (decorative → aria-hidden).
 *
 * @param {{ keys: string[], decorative?: boolean, className?: string }} props
 */
export default function Kbd({ keys, decorative = false, className }) {
  if (!keys || keys.length === 0) return null
  return (
    <kbd
      dir="ltr"
      aria-hidden={decorative || undefined}
      className={cx('inline-flex shrink-0 items-center gap-1 font-sans', className)}
    >
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="inline-flex min-w-6 items-center justify-center rounded-(--radius-xs) border border-outline-variant bg-surface px-1.5 font-sans text-label-sm text-on-surface-variant"
        >
          {key}
        </kbd>
      ))}
    </kbd>
  )
}
