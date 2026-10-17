import Link from 'next/link'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'

export type Crumb = {
  label: string
  href?: string
  /** prefetch של Next. דף הבית כבד (סטטיסטיקות, הורדות) ואינו היעד הסביר מכאן — בלי prefetch */
  prefetch?: boolean
}

/**
 * פירורי הלחם של אזור המדריכים: רשימה סדורה בתוך nav בעל שם. הפריט האחרון הוא הדף הנוכחי
 * (aria-current, בלי קישור). המפריד — חץ דקורטיבי בכיוון הקריאה, שמאלה: chevron_left (גופן
 * האייקונים אינו מראה חיצים ב-RTL — השם הוא הכיוון הפיזי).
 */
export default function DocsBreadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="נתיב" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1 text-body-sm text-on-surface-variant">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  prefetch={item.prefetch}
                  className={cx(
                    'inline-flex min-h-(--touch-target) min-w-(--touch-target) items-center justify-center rounded-sm underline-offset-4 transition-colors hover:text-primary hover:underline',
                    FOCUS_RING
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cx('inline-flex min-h-(--touch-target) items-center', last && 'text-on-surface')}>
                  {item.label}
                </span>
              )}
              {!last && <AppIcon name="chevron_left" className="text-base text-outline" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
