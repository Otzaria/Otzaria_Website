import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { AdminHeaderSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { CONFLICTS_DESCRIPTION, CONFLICTS_TITLE } from '@/lib/adminSuggestions/conflictTerms'

const TITLE_WIDTHS = ['w-32', 'w-48', 'w-40']

/** הרשימה בשלד: שורת המונה ושורות ספרים — באותו ריפוד ובאותו גובה כמו ConflictBookRow */
export function ConflictsListSkeleton({ rows = 3 }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="flex min-h-14 items-center px-1 sm:px-2"><Skeleton shape="text" className="w-36 text-body-sm" /></div>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Card as="li" key={i} className="flex items-start gap-2 p-3 sm:p-4">
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 ps-1">
              <Skeleton shape="text" className={cx('max-w-full text-title-md', TITLE_WIDTHS[i % TITLE_WIDTHS.length])} />
              <Skeleton className="h-9.5 w-56 max-w-full" />
            </span>
            <span className="flex size-(--touch-target) items-center justify-center"><Skeleton shape="circle" className="size-6" /></span>
          </Card>
        ))}
      </ul>
    </div>
  )
}

/** המסך כולו (loading.jsx) */
export function ConflictsScreenSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <p role="status" className="sr-only">טוען את הספרים…</p>
      <AdminHeaderSkeleton title={CONFLICTS_TITLE} description={CONFLICTS_DESCRIPTION} />
      <ConflictsListSkeleton />
    </div>
  )
}
