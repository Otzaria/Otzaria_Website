import type { ReactNode } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'

/**
 * הערה בתוך מדריך (טיפ / מידע / זהירות / הצלחה): משטח טונלי בתפקיד הצבע של המצב, אייקון וטקסט.
 * role="note" — הערה משלימה. המשמעות בטקסט עצמו ("טיפ:", "זהירות:"); הצבע מחזק בלבד.
 */
const TONES = {
  tip: { box: 'bg-warning-container text-on-warning-container', icon: 'text-on-warning-container' },
  info: { box: 'bg-info-container text-on-info-container', icon: 'text-on-info-container' },
  caution: { box: 'bg-error-container text-on-error-container', icon: 'text-on-error-container' },
  success: { box: 'bg-success-container text-on-success-container', icon: 'text-on-success-container' }
} as const

export type DocsCalloutTone = keyof typeof TONES

export default function DocsCallout({ tone = 'info', icon, title, children, className }: {
  tone?: DocsCalloutTone
  icon: string
  /** כותרת קצרה מעל התוכן (למשל "זהירות:") — כשההערה כוללת רשימה */
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  const t = TONES[tone]
  return (
    <div role="note" className={cx('flex items-start gap-3 rounded-card p-4 sm:p-5', t.box, className)}>
      <AppIcon name={icon} className={cx('mt-0.5 shrink-0 text-2xl', t.icon)} />
      <div className="min-w-0 flex-1 text-body-md md:text-body-lg [&_li]:text-inherit [&_p]:text-inherit">
        {title && <p className="mb-2 font-bold">{title}</p>}
        {children}
      </div>
    </div>
  )
}
