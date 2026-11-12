import { cx } from '@/components/ui/cx'
import { formatNumber } from '@/lib/adminTerms'

/**
 * שורת מונים קטנה של מסכי האימון (לא כרטיסים גדולים): "12 פנויים · 4 בעבודה · …", בקבוצות (למשל לפי סוג כתב).
 * כל קבוצה — שם קטן, ואחריו המספרים; בטלפון הקבוצות נשברות לשורות, בלי גלילה לרוחב.
 *
 * @param {{ label: string, groups: { title?: string, items: { label: string, value: number | null, strong?: boolean }[] }[], className?: string }} props
 * label — שם האזור לקורא המסך ("מונים"). value=null — עוד לא נטען: מקף במקום המספר, כדי שהשורה תתפוס את מקומה
 * מההתחלה ולא תדחוף את מה שמתחתיה כשהמונים מגיעים.
 */
export default function TrainingCounters({ label, groups, className }) {
  return (
    <ul aria-label={label} aria-busy={groups.some((g) => g.items.some((i) => i.value == null)) || undefined} className={cx('flex flex-wrap gap-x-6 gap-y-2 text-body-sm text-on-surface-variant', className)}>
      {groups.map((g, gi) => (
        <li key={g.title || gi} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          {g.title && <span className="text-label-lg text-on-surface">{g.title}:</span>}
          {g.items.map((item) => (
            <span key={item.label} className="flex items-baseline gap-1 whitespace-nowrap">
              <span className={cx('tabular-nums', item.strong ? 'text-title-sm text-on-surface' : 'text-on-surface')}>{item.value == null ? <span aria-hidden="true">–</span> : formatNumber(item.value)}</span>
              <span>{item.label}</span>
            </span>
          ))}
        </li>
      ))}
    </ul>
  )
}
