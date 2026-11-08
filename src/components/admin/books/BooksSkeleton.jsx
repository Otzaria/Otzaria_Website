import Card from '@/components/ui/Card'
import { AdminHeaderSkeleton, FilterBarSkeleton, TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { DESCRIPTIONS } from './BooksHeader'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import {
  AREA_BOOK, AREA_CHECK, AREA_CONTROLS, AREA_MENU, AREA_PRIMARY, AREA_PROGRESS, AREA_THUMB, ROW_GRID, ROW_PADDING,
} from './bookRowLayout'
import { adminScreenTitle } from '@/lib/adminNav'

const TITLE_WIDTHS = ['w-48', 'w-64', 'w-40', 'w-56', 'w-72', 'w-44', 'w-60', 'w-52']

/**
 * שלד הרשימה — אותה מידה כמו התוכן (שורת הכלים, ואז שורות באותן עמודות — bookRowLayout — באותו
 * גובה ובאותו ריפוד), כך שכשהנתונים מגיעים שום דבר לא זז. aria-busy — על האזור שמכיל אותו.
 */
export function BooksListSkeleton({ rows = 8 }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="flex min-h-14 items-center gap-2 px-1">
        <span className="flex size-(--touch-target) items-center justify-center"><Skeleton className="size-5 rounded-(--radius-xs)" /></span>
        <Skeleton shape="text" className="w-24 text-body-sm" />
        <Skeleton className="ms-auto h-9 w-36" />
      </div>
      <Card as="div" className="@container overflow-hidden">
        <ul className="divide-y divide-outline-variant/60">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className={cx(ROW_GRID, ROW_PADDING)}>
              <span className={cx(AREA_CHECK, 'flex size-(--touch-target) items-center justify-center')}>
                <Skeleton className="size-5 rounded-(--radius-xs)" />
              </span>
              <span className={AREA_THUMB}><Skeleton className="h-12 w-9 rounded-(--radius-xs)" /></span>
              <span className={AREA_BOOK}>
                <Skeleton shape="text" className={cx('max-w-full text-title-sm', TITLE_WIDTHS[i % TITLE_WIDTHS.length])} />
                <span className="mt-0.5 block"><Skeleton shape="text" className="w-36 max-w-full text-body-sm" /></span>
              </span>
              <span className={AREA_CONTROLS}>
                <span className={cx(AREA_PROGRESS, 'flex items-center gap-3 @2xl:flex-col @2xl:items-stretch @2xl:gap-1.5')}>
                  <Skeleton shape="text" className="w-20 max-w-full shrink-0 text-body-sm @2xl:w-32" />
                  <Skeleton shape="pill" className="h-1.5 w-full" />
                </span>
                <span className={AREA_PRIMARY}><Skeleton className="h-7 w-14 rounded-(--radius-pill)" /></span>
              </span>
              <span className={cx(AREA_MENU, 'flex size-(--touch-target) items-center justify-center')}>
                <Skeleton shape="circle" className="size-6" />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

/** שלד המסך כולו (loading.jsx): כותרת (עם הקישוט), לשוניות, חיפוש ושורת הבוררים ורשימה — באותה פריסה
 * ובאותם גבהים כמו המסך, כך שהרשימה לא קופצת כשהנתונים מגיעים */
export function BooksScreenSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="sr-only">טוען את הספרים…</p>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <AdminHeaderSkeleton title={adminScreenTitle('books')} description={DESCRIPTIONS.books} action />
        <TabsSkeleton labels={['ספרים', 'קטגוריות', 'הנחיות כלליות', 'מנויים']} />
        <FilterBarSkeleton labels={['מצב', 'נראות', 'בעלות', 'קטגוריה']} />
      </div>
      <BooksListSkeleton />
    </div>
  )
}
