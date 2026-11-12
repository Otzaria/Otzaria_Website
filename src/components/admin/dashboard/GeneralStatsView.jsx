import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import DashboardSectionHeading from './DashboardSectionHeading'
import RetryButton from './RetryButton'
import { statsGridClass } from './statsGrid'

const HEADING_ID = 'dashboard-stats-title'

/**
 * "מצב כללי" — נתונים בלבד, משניים למה שממתין: כרטיס קומפקטי אחד עם שורת מספרים ופס התקדמות
 * של העמודים שהושלמו. failed → משפט אחד ו"נסה שוב" במקום המספרים.
 * showBooksLink — למי שזה כל הדשבורד שלו (מנהל ספרים בלבד): הפעולה הראשית ליד הכותרת.
 * forced-colors: מסגרת שקופה לכרטיס, ומסילה ומילוי בצבעי המערכת — אחרת הפס (רקע בלבד) נעלם.
 * @param {{
 *   stats: ReturnType<typeof import('@/lib/adminDashboard').buildGeneralStats>,
 *   failed?: boolean,
 *   showBooksLink?: boolean
 * }} props
 */
export default function GeneralStatsView({ stats, failed = false, showBooksLink = false }) {
  return (
    <section aria-labelledby={HEADING_ID} className="@container flex flex-col gap-4">
      <DashboardSectionHeading
        id={HEADING_ID}
        title="מצב כללי"
        action={showBooksLink ? <Button href="/library/admin/books" variant="tonal" size="sm" icon="menu_book">לניהול הספרים</Button> : null}
      />
      <Card padding="md" className="border border-transparent">
        {failed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p id="dashboard-stats-status" className="text-body-md text-on-surface">לא הצלחנו לטעון את המספרים הכלליים</p>
            <RetryButton describedBy="dashboard-stats-status" focusAfterRetry={HEADING_ID} />
          </div>
        ) : (
          <>
            <dl className={statsGridClass(stats.items.length)}>
              {stats.items.map((item) => (
                <div key={item.id} className="flex min-w-0 flex-col">
                  <dt className="text-label-md text-on-surface-variant">{item.label}</dt>
                  <dd className="text-title-lg tabular-nums text-on-surface">{item.value}</dd>
                  {item.hint && <dd className="text-body-sm text-on-surface-variant">{item.hint}</dd>}
                </div>
              ))}
            </dl>
            {stats.progress && (
              <div className="mt-5 border-t border-outline-variant pt-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span id="dashboard-progress-label" className="text-body-sm text-on-surface-variant">{stats.progress.text}</span>
                  <span className="text-label-lg tabular-nums text-on-surface" dir="ltr">{stats.progress.percent}</span>
                </div>
                <div
                  role="progressbar"
                  aria-labelledby="dashboard-progress-label"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={stats.progress.value}
                  aria-valuetext={stats.progress.percent}
                  className="h-2 overflow-hidden rounded-(--radius-pill) bg-surface-container-high forced-colors:border forced-colors:border-[CanvasText]"
                >
                  <div className="h-full rounded-(--radius-pill) bg-primary forced-colors:bg-[CanvasText]" style={{ width: `${stats.progress.value}%` }} />
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </section>
  )
}
