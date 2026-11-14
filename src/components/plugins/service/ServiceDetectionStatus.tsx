import AppIcon from '@/components/ui/AppIcon'
import Loader from '@/components/ui/Loader'
import Ltr from '@/components/ui/Ltr'
import { cx } from '@/components/ui/cx'
import { formatRange, type ServiceRange } from './serviceVersion'
import type { DetectionState } from './useLocalServiceDetection'

/**
 * תוצאת זיהוי השירות במחשב הזה. אין תשובה = "לא הצלחנו לזהות" — לעולם לא "לא מותקן": הדפדפן
 * עלול לחסום את הבדיקה או לבקש הרשאה, וההורדה הידנית נשארת זמינה תמיד.
 */
export default function ServiceDetectionStatus({ detection, range, otherOs, className }: {
  detection: DetectionState
  range: ServiceRange | null
  /** נבחרה מערכת אחרת מזו של המחשב הזה — הזיהוי לא רלוונטי */
  otherOs: boolean
  className?: string
}) {
  const rangeText = range ? <Ltr>{formatRange(range)}</Ltr> : null
  const box = 'flex items-start gap-3 rounded-(--card-radius) p-4 text-body-sm'
  const neutral = cx(box, 'bg-surface-container text-on-surface', className)

  if (otherOs) {
    return (
      <div role="status" className={neutral}>
        <AppIcon name="info" className="mt-0.5 shrink-0 text-[1.25rem] text-primary" />
        <p>בחרתם מערכת אחרת מזו של המחשב הזה — ההורדה מיועדת למחשב אחר, ולכן מוצעים גם המתקין וגם התוסף.</p>
      </div>
    )
  }

  if (detection.status === 'checking' || detection.status === 'idle') {
    return (
      <div role="status" className={neutral}>
        <Loader size="sm" decorative className="mt-0.5 shrink-0" />
        <div>
          <p>בודקים אם השירות כבר מותקן במחשב הזה…</p>
          <p className="mt-1 text-on-surface-variant">ייתכן שהדפדפן יבקש הרשאה לגשת לרשת המקומית.</p>
        </div>
      </div>
    )
  }

  if (detection.status === 'compatible') {
    return (
      <div role="status" className={cx(box, 'bg-success-container text-on-success-container', className)}>
        <AppIcon name="check_circle" className="mt-0.5 shrink-0 text-[1.25rem]" />
        <p>השירות מותקן במחשב הזה (גרסה <Ltr>{detection.version}</Ltr>) ותואם לתוסף. מספיק להוריד את התוסף.</p>
      </div>
    )
  }

  if (detection.status === 'incompatible') {
    return (
      <div role="status" className={cx(box, 'bg-warning-container text-on-warning-container', className)}>
        <AppIcon name="warning" className="mt-0.5 shrink-0 text-[1.25rem]" />
        <div>
          <p className="font-semibold">נדרש עדכון של השירות</p>
          <p className="mt-1">
            במחשב הזה מותקנת גרסה <Ltr>{detection.version}</Ltr> של השירות, והתוסף דורש גרסה {rangeText}.
            {' '}התקינו את המתקין העדכני — הוא כולל גם את התוסף.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div role="status" className={neutral}>
      <AppIcon name="help" className="mt-0.5 shrink-0 text-[1.25rem] text-primary" />
      <div>
        <p className="font-semibold">לא הצלחנו לזהות אם השירות מותקן במחשב הזה</p>
        <p className="mt-1 text-on-surface-variant">
          אם השירות כבר מותקן בגרסה תואמת{rangeText ? <> ({rangeText})</> : null} — מספיק התוסף. אחרת — הורידו את המתקין, שכולל גם את התוסף.
        </p>
      </div>
    </div>
  )
}
