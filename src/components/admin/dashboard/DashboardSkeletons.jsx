import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import DashboardSectionHeading from './DashboardSectionHeading'
import { statsGridClass } from './statsGrid'
import { QUEUE_CARD_FRAME, QUEUE_CARD_INNER, QUEUE_LIST, QUEUE_NOTE_ROW, queueSpanClasses } from './queueLayout'

// כל שורת טקסט בשלד בגובה של שורה אמיתית: הפס בגובה 1em, והשוליים משלימים לגובה השורה (1lh)
// של אותו סגנון טקסט — כך כרטיס השלד באותו גובה בדיוק כמו הכרטיס שיחליף אותו.
const LINE = 'my-[calc((1lh-1em)/2)]'

/** כרטיס בטעינה — אותה מסגרת ואותה פריסה כמו QueueCard */
function QueueCardSkeleton() {
  return (
    <Card className={QUEUE_CARD_FRAME}>
      <span className={QUEUE_CARD_INNER}>
        <span className="[grid-area:icon] self-center"><Skeleton className="size-10" /></span>
        <Skeleton shape="text" className={cx(LINE, 'w-24 [grid-area:title] text-label-lg')} />
        <Skeleton shape="text" className={cx(LINE, 'w-12 [grid-area:count] text-headline-sm @min-[18rem]:self-center')} />
        <Skeleton shape="text" className={cx(LINE, 'w-40 max-w-full [grid-area:label] text-body-sm')} />
        <span className={QUEUE_NOTE_ROW}><Skeleton shape="text" className={cx(LINE, 'w-28')} /></span>
      </span>
    </Card>
  )
}

/**
 * שלד "ממתין לטיפולך": כותרת אמיתית (היא סטטית), ושלד לשורת המשנה ולכרטיסים. count — כל המקומות
 * שהתפקיד רואה (לפני הספירה לא ידוע כמה מהם ריקים), באותה רשת מאוזנת כמו הכרטיסים.
 */
export function QueuesSkeleton({ count }) {
  const cards = Math.max(count, 1)
  return (
    <section aria-labelledby="dashboard-queues-title" aria-busy="true" className="@container flex flex-col gap-4">
      <DashboardSectionHeading
        id="dashboard-queues-title"
        title="ממתין לטיפולך"
        subtitle={<><span className="sr-only">טוען…</span><Skeleton shape="text" className={cx(LINE, 'w-56 max-w-full text-body-md')} /></>}
      />
      <ul className={QUEUE_LIST}>
        {Array.from({ length: cards }, (_, i) => (
          <li key={i} className={queueSpanClasses(i, cards)}><QueueCardSkeleton /></li>
        ))}
      </ul>
    </section>
  )
}

/** שלד "מצב כללי" — אותה רשת ואותם גבהים כמו GeneralStatsView */
export function GeneralStatsSkeleton({ items = 4 }) {
  return (
    <section aria-labelledby="dashboard-stats-title" aria-busy="true" className="@container flex flex-col gap-4">
      <DashboardSectionHeading id="dashboard-stats-title" title="מצב כללי" />
      <Card padding="md" className="border border-transparent">
        <span className="sr-only">טוען את המספרים הכלליים…</span>
        <div className={statsGridClass(items)}>
          {Array.from({ length: items }, (_, i) => (
            <div key={i} className="flex flex-col">
              <Skeleton shape="text" className={cx(LINE, 'w-16 text-label-md')} />
              <Skeleton shape="text" className={cx(LINE, 'w-20 text-title-lg')} />
              {/* הפריט הראשון (ספרים) מגיע עם שורת "לא מוצגים באתר" */}
              {i === 0 && <Skeleton shape="text" className={cx(LINE, 'w-24 text-body-sm')} />}
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-outline-variant pt-4">
          <div className="mb-2 flex items-center justify-between gap-x-4">
            <span className="text-body-sm"><Skeleton shape="text" className={cx(LINE, 'w-48 max-w-full')} /></span>
            <span className="text-label-lg"><Skeleton shape="text" className={cx(LINE, 'w-10')} /></span>
          </div>
          <Skeleton shape="pill" className="h-2 w-full" />
        </div>
      </Card>
    </section>
  )
}
