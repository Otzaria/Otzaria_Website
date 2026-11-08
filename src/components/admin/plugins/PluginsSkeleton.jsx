import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { AdminHeaderSkeleton, FilterBarSkeleton, TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { PLUGIN_VIEWS, VIEW_LABELS, VIEW_SHORT_LABELS } from '@/lib/adminPlugins/pluginsQuery'
import {
  AREA_CHECK, AREA_MAIN, AREA_MENU, AREA_PRIMARY, AREA_STATS, AREA_THUMB, PENDING_ROW_GRID, ROW_PADDING, STORE_ROW_GRID,
} from './pluginRowLayout'
import { PLUGINS_TITLE, VIEW_DESCRIPTIONS } from './pluginsScreenText'

/** הקו הקבוע של תיבת הסימון, בשלד */
const CHECK_SKELETON = 'size-5 rounded-(--radius-xs)'

const TITLE_WIDTHS = ['w-40', 'w-56', 'w-32', 'w-48', 'w-64', 'w-36', 'w-52', 'w-44']

/**
 * שלד הרשימה — אותן עמודות (pluginRowLayout), אותו גובה ואותו ריפוד כמו השורות, כך שכשהנתונים מגיעים
 * שום דבר לא זז. variant: pending (בלי בחירה, שני כפתורים) / store (בחירה, הורדות ודירוג, "פתח").
 */
export function PluginsListSkeleton({ variant = 'pending', rows = 8 }) {
  const store = variant === 'store'
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="flex min-h-14 items-center gap-2 px-1 sm:px-2">
        {store && <span className="flex size-(--touch-target) items-center justify-center"><Skeleton className={CHECK_SKELETON} /></span>}
        <Skeleton shape="text" className="w-28 text-body-sm" />
        <Skeleton className="ms-auto h-9 w-28" />
      </div>
      <Card as="div" className="@container overflow-hidden">
        <ul className="divide-y divide-outline-variant/60">
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className={cx(store ? STORE_ROW_GRID : PENDING_ROW_GRID, ROW_PADDING)}>
              {store && (
                <span className={cx(AREA_CHECK, 'flex size-(--touch-target) items-center justify-center')}>
                  <Skeleton className={CHECK_SKELETON} />
                </span>
              )}
              <span className={AREA_THUMB}><Skeleton className="size-10" /></span>
              <span className={cx(AREA_MAIN, 'flex flex-col gap-1.5')}>
                <Skeleton shape="text" className={cx('max-w-full text-title-sm', TITLE_WIDTHS[i % TITLE_WIDTHS.length])} />
                <Skeleton shape="text" className="w-44 max-w-full text-body-sm" />
                {/* שורה שלישית: בתור — הגרסה; בחנות, ברשימה צרה — ההורדות. רביעית: בתור הצר — מתי הוגש */}
                <Skeleton shape="text" className={cx('max-w-full text-body-sm', i % 2 ? 'w-28' : 'w-36', store && '@2xl:hidden')} />
                {!store && <Skeleton shape="text" className="w-24 max-w-full text-body-sm @2xl:hidden" />}
              </span>
              {store && (
                <span className={AREA_STATS}>
                  <Skeleton shape="text" className="w-20 text-body-sm" />
                  <Skeleton shape="text" className="w-12 text-body-sm" />
                </span>
              )}
              <span className={AREA_PRIMARY}>
                {store ? <Skeleton className="hidden h-7 w-14 rounded-(--radius-pill) @2xl:block" /> : (
                  <>
                    <Skeleton className="hidden h-9 w-20 @2xl:block" />
                    <Skeleton className="hidden h-9 w-14 @2xl:block" />
                    <Skeleton className="h-7 w-14 rounded-(--radius-pill) @2xl:hidden" />
                  </>
                )}
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

/** שלד "סידור החנות" — האזורים, באותם גבהים בערך */
export function StoreLayoutSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <Skeleton className="h-12 w-full" />
      <Card as="div" padding="md" className="flex flex-col gap-4">
        <Skeleton shape="text" className="w-40 text-title-lg" />
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      </Card>
      <Card as="div" padding="md" className="flex flex-col gap-4">
        <Skeleton shape="text" className="w-32 text-title-lg" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </Card>
      <Card as="div" padding="md" className="flex flex-col gap-3">
        <Skeleton shape="text" className="w-32 text-title-lg" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </Card>
    </div>
  )
}

/** תוויות הבוררים של הסינון בכל תצוגה — כמו ב-PluginsFilterBar */
const FILTER_LABELS = { pending: ['סוג'], store: ['מצב', 'קטגוריה'] }

/** הטעינה של נתוני הרשימה: סינון ורשימה — בגובה של המסך האמיתי, כדי שהרשימה לא תקפוץ כשהם מגיעים */
export function PluginsListLoading({ view = 'pending' }) {
  return (
    <div className="flex flex-col gap-5">
      <div aria-hidden="true"><FilterBarSkeleton labels={FILTER_LABELS[view]} layout={view === 'store' ? 'fixed2' : 'fixed1'} /></div>
      <PluginsListSkeleton variant={view} />
    </div>
  )
}

/** שלד המסך כולו (loading.jsx): כותרת, לשוניות, סינון ורשימה — באותה פריסה כמו המסך */
export function PluginsScreenSkeleton({ view = 'pending' }) {
  const list = view === 'pending' || view === 'store'
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="sr-only">טוען את התוספים…</p>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <AdminHeaderSkeleton title={PLUGINS_TITLE} description={VIEW_DESCRIPTIONS[view]} />
        <TabsSkeleton labels={PLUGIN_VIEWS.map((id) => ({ label: VIEW_LABELS[id], shortLabel: VIEW_SHORT_LABELS[id] }))} />
      </div>
      {list && <PluginsListLoading view={view} />}
      {view === 'layout' && <StoreLayoutSkeleton />}
      {view === 'service' && (
        <div aria-hidden="true" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      )}
    </div>
  )
}
