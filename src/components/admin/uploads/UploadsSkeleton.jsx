import Card from '@/components/ui/Card'
import { AdminHeaderSkeleton, FilterBarSkeleton, TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import {
  AREA_BOOK, AREA_CHECK, AREA_CONTROLS, AREA_MENU, AREA_PRIMARY, AREA_STATUS, ROW_GRID, ROW_PADDING, TRASH_ROW_GRID,
} from './uploadRowLayout'
import { adminScreenTitle } from '@/lib/adminNav'

// רוחבי שם משתנים — שלד שנראה כמו רשימה אמיתית ולא כמו פסים זהים
const TITLE_WIDTHS = ['w-48', 'w-64', 'w-40', 'w-56', 'w-72', 'w-44', 'w-60', 'w-52']

/**
 * שלד הרשימה בזמן טעינה — אותה מידה בדיוק כמו התוכן, כך שכשהנתונים מגיעים שום דבר לא זז:
 * שורת הכלים (min-h-14, כמו BulkActionBar), ואז שורות באותן עמודות (uploadRowLayout), באותו
 * גובה מינימלי ובאותו ריפוד, שתי שורות טקסט (שם ופרטים), תג מצב ופעולה.
 * תיבת הבחירה — ריבוע (כמו התיבה האמיתית). aria-busy והכרזת "טוען" — על האזור שמכיל אותו.
 */
export function UploadsListSkeleton({ rows = 8, variant = 'uploads' }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="flex min-h-14 items-center gap-2 px-1">
        <span className="flex size-(--touch-target) items-center justify-center"><Skeleton className="size-5 rounded-(--radius-xs)" /></span>
        <Skeleton shape="text" className="w-40 text-body-sm" />
        <Skeleton className="ms-auto h-9 w-32" />
      </div>
      <Card as="div" className="@container overflow-hidden">
        <ul className="divide-y divide-outline-variant/60">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className={cx(variant === 'trash' ? TRASH_ROW_GRID : ROW_GRID, ROW_PADDING)}>
              <span className={cx(AREA_CHECK, 'flex size-(--touch-target) items-center justify-center')}>
                <Skeleton className="size-5 rounded-(--radius-xs)" />
              </span>
              <span className={AREA_BOOK}>
                <Skeleton shape="text" className={cx('max-w-full text-title-sm', TITLE_WIDTHS[i % TITLE_WIDTHS.length])} />
                <span className="mt-0.5 block">
                  <Skeleton shape="text" className="w-44 max-w-full text-body-sm" />
                </span>
              </span>
              <span className={AREA_CONTROLS}>
                {variant === 'uploads' && (
                  <span className={AREA_STATUS}>
                    <Skeleton shape="pill" className="h-8 w-24" />
                  </span>
                )}
                <span className={AREA_PRIMARY}>
                  <Skeleton className="h-9 w-28" />
                </span>
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

/** שלד המסך כולו (loading.jsx של הנתיב): כותרת, לשוניות, סינון ורשימה — באותה פריסה כמו המסך */
export function UploadsScreenSkeleton({ variant = 'uploads' }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="sr-only">{variant === 'trash' ? 'טוען את האשפה…' : 'טוען את ההעלאות…'}</p>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <AdminHeaderSkeleton
          title={adminScreenTitle('uploads')}
          description={variant === 'trash'
            ? 'העלאות שנמחקו. אפשר לשחזר אותן, או למחוק אותן לצמיתות.'
            : 'ספרים ועמודים שמשתמשים שלחו. בדוק, הורד, ועדכן את המצב של כל ספר.'}
        />
        <TabsSkeleton labels={['העלאות', 'אשפה']} />
        <FilterBarSkeleton labels={variant === 'trash' ? ['סוג', 'משתמש'] : ['סוג', 'מצב', 'משתמש']} />
      </div>
      <UploadsListSkeleton variant={variant} />
    </div>
  )
}
