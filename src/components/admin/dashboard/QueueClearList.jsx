import Link from 'next/link'
import Card from '@/components/ui/Card'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { CLEAR_LIST } from './queueLayout'

/**
 * "כבר מטופל": המקומות הריקים, כל אחד עם משפט שלילה מפורש ("אין הודעות שלא נקראו") — לא התווית
 * החיובית של הכרטיס, שבתוך הרשימה הזו נקראה הפוך ("תוספי שירות ממתינים לך"). קישורים שקטים
 * במקום כרטיסים מעומעמים, כדי שהעין תישאר על מה שדורש טיפול. בלי ריפוד צד לרשימה, כך שהעמודות
 * שלה באותו רוחב כמו עמודות הכרטיסים שמעליה (אותו container ואותו gap).
 * @param {{ cards: import('@/lib/adminDashboard').QueueCardView[] }} props
 */
export default function QueueClearList({ cards }) {
  if (cards.length === 0) return null
  return (
    <Card as="section" aria-labelledby="dashboard-clear-title" className="border border-transparent py-3">
      <h3 id="dashboard-clear-title" className="flex items-center gap-2 px-4 pb-1 text-label-lg text-on-surface-variant sm:px-5">
        <AppIcon name="task_alt" className="text-(length:--icon-size-sm) text-success" />
        כבר מטופל
      </h3>
      <ul className={CLEAR_LIST}>
        {cards.map((card) => (
          <li key={card.id} className="min-w-0">
            <Link
              href={card.href}
              prefetch={false}
              aria-label={card.accessibleName}
              className={cx(
                'flex min-h-(--touch-target) items-center gap-3 rounded-(--radius-control) px-4 py-2 transition-colors hover:bg-(--card-bg-hover) sm:px-5',
                FOCUS_RING
              )}
            >
              <AppIcon name={card.icon} className="shrink-0 text-(length:--icon-size-sm) text-on-surface-variant" />
              <span className="flex min-w-0 flex-col">
                <span className="text-label-lg text-on-surface">{card.title}</span>
                <span className="text-body-sm text-on-surface-variant">{card.label}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
