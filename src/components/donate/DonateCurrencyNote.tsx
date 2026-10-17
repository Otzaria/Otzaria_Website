import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'

/**
 * הערת המטבע של דף התרומה (תרומה בשקלים מול מט"ח): משטח טונלי בתפקיד "אזהרה" — כמו הערת
 * "זהירות" במדריכים — עם אייקון מידע. role="note": מידע משלים לפני התשלום, לא התראה חיה.
 */
export default function DonateCurrencyNote({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cx('flex items-start gap-3 rounded-card bg-warning-container p-4 text-on-warning-container sm:p-5', className)}
    >
      <AppIcon name="info" className="mt-0.5 shrink-0 text-2xl text-on-warning-container" />
      <p className="min-w-0 flex-1 text-body-md text-inherit md:text-body-lg">
        שים לב: עדיף לתרום בשקלים. עמלת ההמרה ממטבע חוץ (למשל דולרים) בשירות זה גבוהה.
      </p>
    </div>
  )
}
