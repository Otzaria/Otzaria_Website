import { useId } from 'react'
import IntentPrefetchLink from '@/components/ui/IntentPrefetchLink'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'
import AdminNavCount from './AdminNavCount'

/**
 * "ממתין לטיפולך" — מיד מתחת ללוח, באדום (טוקני error), כך שהודעה שלא נקראה גלויה מיד
 * בלי לגלול (כמו התג האדום שהיה על לשונית "הודעות"). מוצג רק כשיש לפחות מונה אחד;
 * כשאין כלום ההורה לא מרנדר אותו בכלל. הפריטים קיימים גם במקומם הרגיל בקבוצה שלהם —
 * כאן הם קיצור, ולכן בלי aria-current (הפריט הפעיל מסומן פעם אחת, בקבוצה).
 */
export default function AdminAttentionGroup({ items, onNavigate }) {
  const labelId = useId()
  return (
    <div className="mt-2 rounded-(--radius-control) bg-error-container/60 p-1">
      <span id={labelId} className="flex items-center gap-1.5 px-2.5 pb-0.5 pt-1.5 text-label-sm text-on-error-container">
        <AppIcon name="error" className="text-icon-sm" />
        ממתין לטיפולך
      </span>
      <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <IntentPrefetchLink
              href={item.href}
              onClick={onNavigate}
              className={cx(
                'flex min-h-(--touch-target) items-center gap-3 rounded-(--radius-control) px-2.5 py-2 text-label-lg leading-snug font-semibold text-on-error-container transition-colors hover:bg-error-container',
                FOCUS_RING_INSET
              )}
            >
              <AppIcon name={item.icon} className="shrink-0 text-icon-lg" />
              <span className="min-w-0 flex-1 break-words">{item.label}</span>
              {/* השם הגלוי כבר אומר "הודעות שלא נקראו" — לקורא המסך רק המספר: "הודעות שלא נקראו, 3" */}
              <AdminNavCount count={item.count} accessibleLabel={item.count.toLocaleString('he-IL')} tone="error" />
            </IntentPrefetchLink>
          </li>
        ))}
      </ul>
    </div>
  )
}
