import AppIcon from './AppIcon'
import { cx } from './cx'

const TONES = {
  warning: { box: 'bg-warning-container text-on-warning-container', icon: 'warning' },
  error: { box: 'bg-error-container text-on-error-container', icon: 'error' },
  info: { box: 'bg-info-container text-on-info-container', icon: 'info' },
}

/**
 * הודעה בתוך העמוד (לא קופצת) — למצב שנשאר: "אי אפשר לאשר את ההצעה כמו שהיא", "השירות מושהה".
 * אייקון + כותרת קצרה + הסבר, על משטח בצבע המצב (טוקנים בלבד), רדיוס הפקדים, בלי מסגרת וצל.
 * role="status" כברירת מחדל (מוכרז כשהיא מופיעה בעקבות פעולה); action — כפתור / קישור בסוף.
 *
 * @param {{ tone?: 'warning' | 'error' | 'info', title?: import('react').ReactNode, children?: import('react').ReactNode,
 *   action?: import('react').ReactNode, role?: 'status' | 'alert' | null, className?: string, id?: string }} props
 */
export default function Notice({ tone = 'warning', title, children, action, role = 'status', className, id }) {
  const t = TONES[tone] || TONES.warning
  return (
    <div id={id} role={role || undefined} className={cx('flex items-start gap-3 rounded-(--radius-control) px-4 py-3 text-body-sm', t.box, className)}>
      <AppIcon name={t.icon} className="mt-0.5 shrink-0 text-icon-lg" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-title-sm">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5')}>{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}
