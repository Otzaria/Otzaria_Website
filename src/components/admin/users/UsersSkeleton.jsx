import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { AdminHeaderSkeleton, FilterBarSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { UserColumnsHeader } from './UserRow'
import {
  AREA_JOINED, AREA_MAIN, AREA_MENU, AREA_PAGES, AREA_POINTS, AREA_PRIMARY, AREA_ROLE, AREA_SUB, AREA_TEAMS, ROW_GRID, ROW_PADDING, TAGS_LINE,
} from './userRowLayout'
import { USERS_DESCRIPTION, USERS_TITLE } from './usersScreenText'

const NAME_WIDTHS = ['w-28', 'w-36', 'w-24', 'w-32', 'w-40', 'w-28', 'w-32', 'w-24']

/**
 * שלד הרשימה — אותן עמודות ואותו גובה כמו השורות (userRowLayout), כך שכשהנתונים מגיעים שום דבר לא זז.
 * הטקסטים הקבועים (כותרות העמודות) מוצגים כמו שהם. aria-hidden; ההכרזה "טוען…" — אצל הקורא.
 */
export function UsersListSkeleton({ rows = 8 }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="flex min-h-14 items-center gap-2 px-1 sm:px-2">
        <Skeleton shape="text" className="w-24 text-body-sm" />
        <Skeleton className="ms-auto h-9 w-36" />
      </div>
      <Card as="div" className="@container overflow-hidden">
        <UserColumnsHeader />
        <ul className="divide-y divide-outline-variant/60">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className={cx(ROW_GRID, ROW_PADDING)}>
              <div className={AREA_MAIN}>
                {/* בתוך שורת טקסט באותו גודל — כדי שהגובה יהיה גובה השורה, כמו בשורה האמיתית */}
                <p className="text-title-sm"><Skeleton shape="text" className={cx('inline-block align-middle', NAME_WIDTHS[i % NAME_WIDTHS.length])} /></p>
                <p className="mt-0.5 text-body-sm"><Skeleton shape="text" className="inline-block w-40 align-middle" /></p>
              </div>
              <div className={AREA_SUB}>
                <div className={cx(TAGS_LINE, 'flex items-center gap-1')}>
                  <Skeleton className="h-(--badge-height-sm) w-16 rounded-(--radius-pill)" />
                </div>
                <p className="mt-1 text-body-sm"><Skeleton shape="text" className="inline-block w-32 align-middle" /></p>
              </div>
              <div className={AREA_ROLE}><Skeleton className="h-(--badge-height-sm) w-16 rounded-(--radius-pill)" /></div>
              <div className={AREA_TEAMS}><Skeleton shape="text" className="w-10 text-body-sm" /></div>
              <div className={AREA_POINTS}><Skeleton shape="text" className="w-10" /></div>
              <div className={AREA_PAGES}><Skeleton shape="text" className="w-8" /></div>
              <div className={AREA_JOINED}><Skeleton shape="text" className="w-16" /></div>
              <div className={AREA_PRIMARY}><Skeleton className="h-7 w-14 rounded-(--radius-pill)" /></div>
              <div className={cx(AREA_MENU, 'flex size-(--touch-target) items-center justify-center')}><Skeleton shape="circle" className="size-6" /></div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

/** כל המסך בטעינה (loading.jsx, ו"נסה שוב"): כותרת, סינון ורשימה */
export function UsersScreenSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="sr-only">טוען את רשימת המשתמשים…</p>
      <AdminHeaderSkeleton title={USERS_TITLE} description={USERS_DESCRIPTION} />
      <FilterBarSkeleton labels={['תפקיד', 'צוות או חסימה']} layout="fixed2" />
      <UsersListSkeleton />
    </div>
  )
}
