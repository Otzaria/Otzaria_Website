import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { AdminHeaderSkeleton, FilterBarSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { PageColumnsHeader } from './PageRow'
import { FILTER_LABELS } from './filterLayout'
import {
  AREA_CHECK, AREA_MAIN, AREA_MENU, AREA_NUMBER, AREA_PRIMARY, AREA_STATUS, AREA_SUB, AREA_UPDATED, AREA_USER, ROW_GRID, ROW_PADDING,
} from './pageRowLayout'
import { PAGES_DESCRIPTION, PAGES_TITLE } from './pagesScreenText'

const NAME_WIDTHS = ['w-36', 'w-44', 'w-28', 'w-40', 'w-32', 'w-48', 'w-36', 'w-28']

/**
 * שלד הרשימה — אותן עמודות ואותו גובה כמו השורות (pageRowLayout), כך שכשהנתונים מגיעים שום דבר לא זז.
 * aria-hidden; ההכרזה "טוען…" — אצל הקורא. progress — כשנטענות כמה בקשות ("טוען… 10,000 מתוך 14,617"): טקסט
 * שקט במקום המונה, באותה שורה (בלי להזיז את השלד).
 */
export function PagesListSkeleton({ rows = 10, progress = '' }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className={cx('flex min-h-14 items-center gap-x-1 py-1', ROW_PADDING)}>
        <span className="flex size-(--touch-target) items-center justify-center"><Skeleton className="size-5 rounded-(--radius-sm)" /></span>
        {progress
          ? <span className="text-body-sm tabular-nums text-on-surface-variant">{progress}</span>
          : <Skeleton shape="text" className="w-24 text-body-sm" />}
        <Skeleton className="ms-auto h-9 w-36" />
      </div>
      <Card as="div" className="@container overflow-hidden">
        <PageColumnsHeader />
        <ul className="divide-y divide-outline-variant/60">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className={cx(ROW_GRID, ROW_PADDING)}>
              <div className={cx(AREA_CHECK, 'flex size-(--touch-target) items-center justify-center')}><Skeleton className="size-5 rounded-(--radius-sm)" /></div>
              <div className={AREA_MAIN}>
                <p className="text-title-sm"><Skeleton shape="text" className={cx('inline-block max-w-full align-middle', NAME_WIDTHS[i % NAME_WIDTHS.length])} /></p>
              </div>
              <div className={AREA_SUB}>
                {i % 3 !== 0 && <Skeleton className="h-(--badge-height-sm) w-14 rounded-(--radius-pill)" />}
                <Skeleton shape="text" className="w-20 text-body-sm" />
                <Skeleton shape="text" className="min-w-0 w-20 text-body-sm" />
              </div>
              <div className={AREA_NUMBER}><Skeleton shape="text" className="w-8" /></div>
              <div className={AREA_STATUS}><Skeleton className="h-(--badge-height-sm) w-14 rounded-(--radius-pill)" /></div>
              <div className={AREA_USER}><Skeleton shape="text" className="w-24" /></div>
              <div className={AREA_UPDATED}><Skeleton shape="text" className="w-20" /></div>
              {/* "שחרר" הוא טקסט בלי רקע — בשלד קו טקסט (לא גוש), ובשורה אחת מכל שלוש (רוב העמודים אינם בעבודה) */}
              <div className={AREA_PRIMARY}>{i % 3 === 0 && <Skeleton shape="text" className="mx-3 w-14 text-label-lg" />}</div>
              <div className={cx(AREA_MENU, 'flex size-(--touch-target) items-center justify-center')}><Skeleton shape="circle" className="size-6" /></div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

/** סרגל הסינון: בטלפון — כפתור "סינון"; ברוחב — הבוררים עם התוויות שלהם */
export function PagesFilterSkeleton() {
  return <FilterBarSkeleton labels={FILTER_LABELS} layout="pages" search={false} />
}

/** כל המסך בטעינה (loading.jsx, ו-Suspense): כותרת, סינון ורשימה */
export function PagesScreenSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="sr-only">טוען את העמודים…</p>
      <AdminHeaderSkeleton title={PAGES_TITLE} description={PAGES_DESCRIPTION} />
      <PagesFilterSkeleton />
      <PagesListSkeleton />
    </div>
  )
}
