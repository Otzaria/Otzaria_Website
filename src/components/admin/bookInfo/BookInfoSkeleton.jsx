import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { AdminHeaderSkeleton, TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { BOOK_INFO_DESCRIPTION, BOOK_INFO_TITLE, VIEW_LABELS } from '@/lib/adminBookInfoScreen/bookInfoTerms'
import { AREA_CHANGES, AREA_LINK, AREA_MAIN, AREA_STATUS, AREA_SUB, AREA_WHO, ROW_GRID, ROW_PADDING } from './changeSetRowLayout'

/** חיפוש ובורר המצב — באותן מידות כמו בפועל */
export function FiltersSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Skeleton className="h-(--field-height-md) w-full sm:max-w-md" />
      <Skeleton className="h-(--field-height-md) w-full sm:w-60" />
    </div>
  )
}

/** שלד שורות הבקשות — באותה פריסה כמו ChangeSetRow */
export function ChangeSetRowsSkeleton({ rows = 6 }) {
  return (
    <div aria-hidden="true" className="@container flex flex-col">
      <div className="min-h-10" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cx(ROW_GRID, ROW_PADDING)}>
          <div className={AREA_MAIN}><Skeleton className="h-5 w-36" /><Skeleton className="mt-1.5 h-4 w-20" /></div>
          <div className={AREA_SUB}><Skeleton shape="pill" className="h-6 w-24" /></div>
          <div className={AREA_CHANGES}><Skeleton className="h-4 w-44" /><Skeleton className="mt-1.5 h-4 w-32" /></div>
          <div className={AREA_WHO}><Skeleton className="h-4 w-24" /></div>
          <div className={AREA_STATUS}><Skeleton shape="pill" className="h-6 w-24" /></div>
          <div className={AREA_LINK}><Skeleton shape="pill" className="h-7 w-16" /></div>
        </div>
      ))}
    </div>
  )
}

/** שלד כרטיסי ההצעות הישנות */
export function LegacySkeleton({ cards = 3 }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-(--radius-shape) bg-surface p-3 sm:p-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 w-40 self-end" />
        </div>
      ))}
    </div>
  )
}

/** כל המסך, עד שהכתובת נקראת (Suspense) */
export function BookInfoScreenSkeleton({ view = 'open' }) {
  return (
    <div className="flex flex-col gap-5">
      <AdminHeaderSkeleton title={BOOK_INFO_TITLE} description={BOOK_INFO_DESCRIPTION} action />
      <div aria-busy="true" className="flex flex-col gap-5">
        <p role="status" className="sr-only">טוען את פרטי הספרים…</p>
        <TabsSkeleton labels={[VIEW_LABELS.open, VIEW_LABELS.all]} />
        {view === 'legacy' ? <LegacySkeleton /> : <><FiltersSkeleton /><ChangeSetRowsSkeleton /></>}
      </div>
    </div>
  )
}
