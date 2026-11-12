import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { AdminHeaderSkeleton, TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { AREA_CHECK, AREA_MAIN, AREA_MENU, AREA_OPEN, AREA_STATUS, AREA_SUB, ROW_GRID, ROW_PADDING } from './trainingRowLayout'

/** שלד השורות של "עמודים לאימון" — באותה פריסה כמו TrainingPageRow, כדי שהרשימה לא תקפוץ */
export function TrainingRowsSkeleton({ rows = 8 }) {
  return (
    <div aria-hidden="true" className="@container flex flex-col">
      <div className="min-h-14" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cx(ROW_GRID, ROW_PADDING)}>
          <div className={cx(AREA_CHECK, 'flex size-(--touch-target) items-center justify-center')}><Skeleton className="size-5" /></div>
          <div className={AREA_MAIN}><Skeleton className="h-5 w-40" /></div>
          <div className={AREA_SUB}><Skeleton className="h-5 w-48" /></div>
          <div className={AREA_STATUS}><Skeleton className="h-6 w-20" /></div>
          <div className={AREA_OPEN}><Skeleton className="h-7 w-14" /></div>
          <div className={cx(AREA_MENU, 'flex size-(--touch-target) items-center justify-center')}><Skeleton shape="circle" className="size-6" /></div>
        </div>
      ))}
    </div>
  )
}

/** שלד של רשימת כרטיסים (שורה לתמלול / עמוד לתיוג): תמונה ולידה טקסט */
export function TrainingCardsSkeleton({ cards = 4, imageClassName = 'h-16 md:w-1/2' }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-(--radius-card) bg-surface-container-low p-4 md:flex-row">
          <Skeleton className={cx('w-full shrink-0', imageClassName)} />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-9 w-40" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** כל המסך, עד שהכתובת נקראת (Suspense) */
export function TrainingScreenSkeleton({ title, description, tabs, cards = false, action = false }) {
  return (
    <div className="flex flex-col gap-5">
      <AdminHeaderSkeleton title={title} description={description} action={action} />
      <div aria-busy="true" className="flex flex-col gap-5">
        <p role="status" className="sr-only">טוען…</p>
        {tabs && <TabsSkeleton labels={tabs.map((label) => ({ label, count: '00' }))} />}
        {cards ? <TrainingCardsSkeleton /> : <TrainingRowsSkeleton />}
      </div>
    </div>
  )
}
