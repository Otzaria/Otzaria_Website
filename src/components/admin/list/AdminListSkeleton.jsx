import Skeleton from '@/components/ui/Skeleton'
import TitleOrnament from '@/components/ui/TitleOrnament'
import { cx } from '@/components/ui/cx'
import { filterLayout, filterPanelClass } from './filterBarLayout'

/**
 * שלדי טעינה של החלק העליון במסכי הרשימה של הניהול (ספרים, העלאות) — באותה מידה בדיוק כמו המסך
 * האמיתי, כדי שכשהנתונים מגיעים הרשימה לא קופצת. הטקסטים הקבועים (שם המסך, ההסבר, תוויות הבוררים) לא
 * תלויים בנתונים — לכן הם מוצגים כמו שהם, באותו גופן ובאותה שבירת שורות כמו במסך, ורק מה שתלוי בנתונים
 * (שדות, כפתורים) הוא שלד. כל השלד aria-hidden; ההכרזה "טוען…" — אצל הקורא.
 */

/**
 * כותרת המסך — כמו AdminScreenHeader: שם, קישוט, הסבר; action / menu — מקום לפעולה הראשית ול-⋮.
 * action — true: מלבן ברוחב קבוע; או אלמנט במידה המדויקת של הכפתור (כשהרוחב שלו משנה את שבירת ההסבר בטלפון).
 */
export function AdminHeaderSkeleton({ title, description, action = false, menu = true }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
      <div className="flex w-fit min-w-0 flex-col">
        <p className="font-display text-headline-md leading-tight text-on-surface">{title}</p>
        <TitleOrnament className="ms-0 mt-2" ratio="100%" min="96px" />
      </div>
      {(action || menu) && (
        <div className="flex shrink-0 items-center gap-2">
          {action === true ? <Skeleton className="h-10 w-28" /> : action || null}
          {menu && <span className="flex size-(--touch-target) items-center justify-center"><Skeleton shape="circle" className="size-6" /></span>}
        </div>
      )}
      <p className="col-span-full mt-3 text-body-md text-on-surface-variant sm:col-span-1">{description}</p>
    </div>
  )
}

/**
 * לשוניות (TabLinks): השמות עצמם, בצבע שקט. labels — שם, או { label, shortLabel, count } כמו ב-TabLinks; count —
 * מקום שמור למונה ("נכנסות 8"), כדי שהלשוניות שאחריה לא יזוזו כשהמסך מגיע.
 */
export function TabsSkeleton({ labels }) {
  return (
    <div className="flex gap-1 border-b border-outline-variant">
      {labels.map((item) => {
        const { label, shortLabel, count } = typeof item === 'string' ? { label: item } : item
        return (
          <span key={label} className="flex min-h-(--touch-target) items-center gap-2 whitespace-nowrap px-2 text-label-lg text-on-surface-variant sm:px-4">
            {shortLabel ? <><span className="sm:hidden">{shortLabel}</span><span className="max-sm:hidden">{label}</span></> : label}
            {count && <span className="invisible rounded-(--radius-pill) px-2 text-label-sm tabular-nums">{count}</span>}
          </span>
        )
      })}
    </div>
  )
}

/**
 * שורת הסינון — כמו list/FilterBar, באותה פריסה (filterBarLayout): חיפוש (ובטלפון — כפתור "סינון"; בלי search —
 * רק הכפתור), ומתחת — הבוררים עם התוויות שלהם, ומקום ל"נקה סינון".
 * @param {{ labels: string[], layout?: keyof typeof import('./filterBarLayout').FILTER_LAYOUTS, search?: boolean }} props
 */
export function FilterBarSkeleton({ labels, layout = `fill${labels.length}`, search = true }) {
  const { compact } = filterLayout(layout)
  return (
    <div aria-hidden="true" className="@container flex flex-col gap-3">
      {search ? (
        <div className="flex items-end gap-2">
          <Skeleton className="h-(--field-height-md) min-w-0 flex-1" />
          <Skeleton className={cx('h-(--button-height-sm) w-24', compact)} />
        </div>
      ) : (
        <div className={cx('flex min-h-10 items-center gap-2', compact)}><Skeleton className="h-(--button-height-sm) w-24" /></div>
      )}
      <div className={filterPanelClass(layout, false)}>
        {labels.map((label) => (
          <span key={label} className="block">
            <span className="mb-2 block text-label-md text-on-surface-variant">{label}</span>
            <Skeleton className="h-(--field-height-md) w-full" />
          </span>
        ))}
        <span className="w-24" />
      </div>
    </div>
  )
}
