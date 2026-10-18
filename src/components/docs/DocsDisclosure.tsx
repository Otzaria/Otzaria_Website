import type { ReactNode } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'

/**
 * מקפל בנייד (details/summary — בלי JavaScript): כותרת לחיצה ברוחב מלא ותוכן שנפתח מתחתיה.
 * משמש את ניווט המדריך ואת תוכן העניינים, שבמסך רחב מוצגים פתוחים בצד.
 */
export default function DocsDisclosure({ label, icon, children, className }: {
  label: string
  icon?: string
  children: ReactNode
  className?: string
}) {
  return (
    <details className={cx('group rounded-card bg-surface', className)}>
      <summary
        className={cx(
          'flex min-h-(--touch-target) cursor-pointer list-none items-center gap-3 rounded-card px-4 py-2 text-title-sm text-on-surface [&::-webkit-details-marker]:hidden',
          FOCUS_RING
        )}
      >
        {icon && <AppIcon name={icon} className="text-xl text-primary" />}
        <span className="flex-1">{label}</span>
        <AppIcon
          name="expand_more"
          className="text-xl text-on-surface-variant transition-transform ease-standard group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="px-2 pb-3">{children}</div>
    </details>
  )
}
