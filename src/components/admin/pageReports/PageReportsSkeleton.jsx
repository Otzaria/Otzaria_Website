import Skeleton from '@/components/ui/Skeleton'
import { cardClasses } from '@/components/ui/Card'
import { AdminHeaderSkeleton, FilterBarSkeleton, TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { PAGE_REPORTS_DESCRIPTION, PAGE_REPORTS_TITLE, TAB_LABELS } from '@/lib/adminPageReportsScreen/pageReportsTerms'

/** שלד הכרטיסים — בערך בגובה של כרטיס טעות (כותרת, ההשוואה בשתי תיבות, צילום ופעולות) */
export function ReportCardsSkeleton({ cards = 3 }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className={cardClasses({ className: 'flex flex-col gap-4 p-3 sm:p-4' })}>
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-40" /></div>
            <Skeleton className="h-(--button-height-sm) w-28" />
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
            </div>
            <Skeleton className="h-40 w-28 max-md:hidden" />
          </div>
          <Skeleton className="h-10 w-48 self-end" />
        </div>
      ))}
    </div>
  )
}

/** שורת הסינון — מצב וספר (כמו PageReportsFilters) */
export function ReportFiltersSkeleton() {
  return <FilterBarSkeleton labels={['מצב', 'ספר']} layout="fixed2" search={false} />
}

/** כל המסך, עד שהכתובת נקראת (Suspense) ובמעבר לדף (loading.jsx) */
export function PageReportsScreenSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <AdminHeaderSkeleton title={PAGE_REPORTS_TITLE} description={PAGE_REPORTS_DESCRIPTION} />
      <div aria-busy="true" className="flex flex-col gap-5">
        <p role="status" className="sr-only">טוען את הדיווחים…</p>
        <TabsSkeleton labels={[{ label: TAB_LABELS.book_error, count: '00' }, { label: TAB_LABELS.message, count: '00' }]} />
        <ReportFiltersSkeleton />
        <ReportCardsSkeleton />
      </div>
    </div>
  )
}
