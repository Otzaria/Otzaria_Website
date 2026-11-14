import EmptyState from '@/components/ui/EmptyState'
import { dashboardAnnouncement } from '@/lib/adminDashboard'
import DashboardSectionHeading from './DashboardSectionHeading'
import QueueCard from './QueueCard'
import QueueErrorCard from './QueueErrorCard'
import QueueClearList from './QueueClearList'
import RetryButton from './RetryButton'
import { Announce } from './LiveStatus'
import { QUEUE_LIST, queueSpanClasses } from './queueLayout'

const HEADING_ID = 'dashboard-queues-title'

/**
 * "ממתין לטיפולך": רשימה אחת לפי דחיפות (בלי כותרות קבוצה) — כרטיס לכל מקום שיש בו פריטים או
 * שלא נטען, ומתחת "כבר מטופל" עם מה שריק.
 * הכול ריק — "הכול מטופל" פעם אחת, בלי הרשימה (הסרגל כבר מקשר לכל המסכים).
 * הכול נכשל — הודעה אחת וכפתור "נסה שוב" אחד, במקום כרטיס שגיאה לכל מקום.
 * בטקסט שהמשתמש רואה או שומע אין את המילה "תור" (משוב המשתמש).
 * @param {{ view: ReturnType<typeof import('@/lib/adminDashboard').buildDashboardView>, stamp?: number }} props
 */
export default function DashboardQueuesView({ view, stamp }) {
  if (!view.hasQueues) return null
  return (
    <section aria-labelledby={HEADING_ID} className="@container flex flex-col gap-4">
      <DashboardSectionHeading id={HEADING_ID} title="ממתין לטיפולך" subtitle={view.summary} />
      <Announce message={dashboardAnnouncement(view)} stamp={stamp} />

      {view.allFailed ? (
        <EmptyState
          as="h3"
          icon="cloud_off"
          title="לא הצלחנו לטעון את מה שממתין לך"
          description="ייתכן שזו תקלה זמנית בחיבור. נסה שוב בעוד רגע."
          actions={<RetryButton focusAfterRetry={HEADING_ID} />}
          className="border border-transparent md:py-10"
        />
      ) : view.allClear ? (
        <EmptyState
          as="h3"
          icon="task_alt"
          title="הכול מטופל"
          description="אין כרגע שום דבר שממתין לך. כשיגיע משהו חדש, הוא יופיע כאן."
          className="border border-transparent md:py-10"
        />
      ) : (
        <>
          <ul className={QUEUE_LIST}>
            {view.cards.map((card, index) => (
              <li key={card.id} className={queueSpanClasses(index, view.cards.length)}>
                {card.state === 'error'
                  ? <QueueErrorCard card={card} focusAfterRetry={HEADING_ID} />
                  : <QueueCard card={card} />}
              </li>
            ))}
          </ul>
          <QueueClearList cards={view.clear} />
        </>
      )}
    </section>
  )
}
