import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'

/** האזהרה הקבועה של המפרט (סעיף 2) — נוסח מחייב, לא לשנות */
export const SERVICE_WARNING_TEXT =
  'התוכנה החיצונית פועלת ברקע גם כשאוצריא סגורה. התחזוקה, האיכות וצריכת המשאבים תלויות במפתח. הסרת התוסף אינה מסירה את השירות. בדיקות החנות אינן מבטיחות היעדר תקלות או סיכוני אבטחה.'

/** האזהרה כהערה בתוך חלון ההורדה */
export default function ServiceWarning({ className }: { className?: string }) {
  return (
    <div role="note" className={cx('flex items-start gap-3 rounded-(--card-radius) bg-warning-container p-4 text-on-warning-container', className)}>
      <AppIcon name="warning" className="mt-0.5 shrink-0 text-[1.25rem]" />
      <p className="text-body-sm">{SERVICE_WARNING_TEXT}</p>
    </div>
  )
}
