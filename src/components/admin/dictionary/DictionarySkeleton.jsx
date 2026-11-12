import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { AdminHeaderSkeleton, TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { DICTIONARY_DESCRIPTION, DICTIONARY_TITLE, VIEW_LABELS } from '@/lib/adminDictionaryScreen/dictionaryTerms'
import { AREA_CHECK, AREA_MAIN, AREA_MENU, AREA_PRIMARY, AREA_USERS, ROW_GRID, ROW_PADDING } from './wordRowLayout'

/** שלד השורות — באותה פריסה בדיוק כמו WordRow, כדי שהרשימה לא תקפוץ כשהנתונים מגיעים */
export function WordRowsSkeleton({ rows = 8 }) {
  return (
    <div aria-hidden="true" className="@container flex flex-col">
      <div className="min-h-14" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cx(ROW_GRID, ROW_PADDING)}>
          <div className={cx(AREA_CHECK, 'flex size-(--touch-target) items-center justify-center')}><Skeleton className="size-5" /></div>
          <div className={AREA_MAIN}><Skeleton className="h-5 w-32" /></div>
          <div className={AREA_USERS}><Skeleton className="h-6 w-24" /></div>
          <div className={AREA_PRIMARY}><Skeleton className="h-10 w-40" /></div>
          <div className={cx(AREA_MENU, 'flex size-(--touch-target) items-center justify-center')}><Skeleton shape="circle" className="size-6" /></div>
        </div>
      ))}
    </div>
  )
}

/** חיפוש — שדה בגובה האמיתי */
export function DictionarySearchSkeleton() {
  return <Skeleton className="h-(--field-height-md) w-full sm:max-w-md" />
}

/** כל המסך, עד שהכתובת נקראת (Suspense) */
export function DictionaryScreenSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <AdminHeaderSkeleton title={DICTIONARY_TITLE} description={DICTIONARY_DESCRIPTION} />
      <div aria-busy="true" className="flex flex-col gap-5">
        <p role="status" className="sr-only">טוען את ההצעות למילון…</p>
        <TabsSkeleton labels={[{ label: VIEW_LABELS.pending, count: '00' }, { label: VIEW_LABELS.skipped, count: '00' }]} />
        <DictionarySearchSkeleton />
        <WordRowsSkeleton />
      </div>
    </div>
  )
}
