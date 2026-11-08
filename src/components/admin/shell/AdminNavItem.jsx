import IntentPrefetchLink from '@/components/ui/IntentPrefetchLink'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'
import { countAccessibleLabel } from '@/lib/adminNav'
import AdminNavCount from './AdminNavCount'

/**
 * פריט בסרגל הניהול: קישור בגובה מטרת מגע (44px), אייקון + שם, ומונה אם יש.
 * פעיל — רקע טונלי, טקסט מודגש ופס primary בקצה ההתחלה (הסימון הלא-צבעוני של המצב,
 * WCAG 1.4.11 — הרקע הטונלי לבדו נבדל מהמשטח רק מעט). aria-current="page" גם בדפי משנה.
 */
export default function AdminNavItem({ item, count = 0, active = false, onNavigate }) {
  return (
    <li>
      {/* prefetch רק בכוונה (ריחוף/פוקוס/נגיעה) — כ-19 קישורים בכל עמוד ניהול */}
      <IntentPrefetchLink
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'relative flex min-h-(--touch-target) items-center gap-3 rounded-(--radius-control) px-3 py-2 text-body-md leading-snug transition-colors',
          'before:absolute before:inset-y-2.5 before:start-0 before:w-(--indicator-thickness) before:rounded-(--radius-pill) before:bg-primary before:opacity-0 before:transition-opacity',
          active
            ? 'bg-secondary-container font-semibold text-on-secondary-container before:opacity-100'
            : 'font-medium text-on-surface-variant hover:bg-surface-selected hover:text-on-surface',
          FOCUS_RING_INSET
        )}
      >
        <AppIcon name={item.icon} className="shrink-0 text-icon-lg" />
        <span className="min-w-0 flex-1 break-words">{item.label}</span>
        {count > 0 && (
          <AdminNavCount count={count} accessibleLabel={countAccessibleLabel(item.badge, count)} tone={active ? 'onActive' : 'neutral'} />
        )}
      </IntentPrefetchLink>
    </li>
  )
}
