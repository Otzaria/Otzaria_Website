import AppIcon from '@/components/ui/AppIcon'
import { TOUCH_TARGET_OVERLAY } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { safeHref } from '@/components/ui/Button'

/**
 * "פתח ב-GitHub" בשורה — צ'יפ שקט (כמו "פתח" בשאר המסכים), עם מספר הבקשה וסימן "נפתח בחלון חדש". קורא המסך
 * שומע "בקשת מיזוג 12 ב-GitHub (נפתח בחלון חדש)" (aria-label — כמו NewWindowHint, במשפט אחד). בלי כתובת (הבקשה עוד
 * לא נפתחה, או נכשלה) — "—" שקט.
 * @param {{ url?: string | null, number?: number | null, className?: string }} props
 */
export default function PullRequestLink({ url, number, className }) {
  const href = url ? safeHref(url) : undefined
  if (!href) return <span className="text-body-sm text-on-surface-variant"><span aria-hidden="true">—</span><span className="sr-only">אין בקשת מיזוג</span></span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`בקשת מיזוג${number ? ` ${number}` : ''} ב-GitHub (נפתח בחלון חדש)`}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-(--radius-pill) bg-surface-container py-0.5 pe-2 ps-2.5 text-label-md text-on-surface transition-colors hover:bg-surface-container-high',
        TOUCH_TARGET_OVERLAY,
        FOCUS_RING,
        className
      )}
    >
      {number ? <bdi dir="ltr" className="tabular-nums">#{number}</bdi> : 'פתח'}
      <AppIcon name="open_in_new" className="text-icon-sm" />
    </a>
  )
}
