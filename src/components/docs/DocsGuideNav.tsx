import type { ReactNode } from 'react'
import Link from 'next/link'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'
import DocsDisclosure from './DocsDisclosure'
import type { GuideNavItem } from './docsNav'

/**
 * ניווט בין דפי המדריך למשתמש (מהסרגל של הוויקי). הדף הנוכחי — aria-current ומשטח נבחר.
 * prefetch={false}: הרשימה מציגה את כל דפי המדריך, וברירת המחדל שלפה מיד עם הטעינה את כולם
 * (כ-70 בקשות RSC, כ-190KB) — גם מי שקורא דף אחד בלבד. הדפים עצמם סטטיים (ISR) ו-loading.jsx
 * מציג fallback מיידי, כך שהמעבר נשאר מהיר.
 * variant: panel — רשימה בצד (מסך רחב); folded — מקפל סגור (נייד/טבלט).
 * currentChildren — מוצג מתחת לדף הנוכחי, בהזחה (ב-panel: "בעמוד זה", DocsToc variant="panel").
 */
export default function DocsGuideNav({ title, items, current, iconFor, variant, currentChildren, className }: {
  title: string
  items: GuideNavItem[]
  current: string
  iconFor: (slug: string) => string
  variant: 'panel' | 'folded'
  currentChildren?: ReactNode
  className?: string
}) {
  if (items.length === 0) return null
  const list = (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = item.slug === current
        return (
          <li key={item.slug}>
            <Link
              href={`/docs/${item.slug}`}
              prefetch={false}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex min-h-(--touch-target) items-center gap-2.5 rounded-control px-3 py-1.5 text-body-sm transition-colors lg:min-h-9 lg:py-1',
                active
                  ? 'bg-secondary-container font-semibold text-on-secondary-container'
                  : 'text-on-surface-variant hover:bg-surface-selected hover:text-on-surface',
                FOCUS_RING_INSET
              )}
            >
              <AppIcon name={iconFor(item.slug)} className={cx('text-lg', active ? 'text-on-secondary-container' : 'text-primary')} />
              <span className="min-w-0">{item.title}</span>
            </Link>
            {active && currentChildren && (
              // מתחת לדף הנוכחי, בהזחה קלה — "בעמוד זה" שייך לדף הזה
              <div className="ms-3 mt-1.5 mb-3">{currentChildren}</div>
            )}
          </li>
        )
      })}
    </ul>
  )

  if (variant === 'folded') {
    return (
      <nav aria-label={title} className={className}>
        <DocsDisclosure label={title} icon="menu_book">{list}</DocsDisclosure>
      </nav>
    )
  }
  return (
    <nav aria-label={title} className={className}>
      <p className="mb-2 px-3 text-label-md text-on-surface-variant">{title}</p>
      {list}
    </nav>
  )
}
