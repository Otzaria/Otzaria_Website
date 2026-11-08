'use client'

import AppIcon from './AppIcon'
import { cx } from './cx'
import { FOCUS_RING } from './focusRing'

/** הערך המיוחד של current: כל השלבים הושלמו (למשל אחרי שליחה) */
export const STEPPER_COMPLETE = '__complete__'

/**
 * שלבים של תהליך (אשף): שורה של שלבים ממוספרים עם קו ביניהם.
 *   השלב הנוכחי — הבולט בשורה: עיגול מלא primary עם המספר, ושם בצבע מלא; aria-current="step".
 *   שלב שהושלם — ✓ בעיגול שקט (secondary-container), ואפשר לחזור אליו (כפתור, כש-onSelect ניתן; title: "חזור לשלב: ספר").
 *   שלב שעוד לא הגיע — טבעת דקה, ולא לחיץ (לא מדלגים קדימה).
 * המצב לא בצבע בלבד: ✓ / מספר, ולקורא המסך doneText / currentText ("הושלם" / "השלב הנוכחי").
 * current = STEPPER_COMPLETE — כל השלבים הושלמו (ואין נוכחי). ערך לא מוכר — השלב הראשון, ואזהרה בפיתוח.
 *
 * בלי ניהול מצב — הקורא מחליט מה הנוכחי ומה קורה בלחיצה (למשל לא לחזור באמצע שליחה: disabled).
 * ברוחב צר (המכל עצמו מתחת ל-28rem — container query) השמות עוברים מתחת לעיגולים, בגודל קטן — כך רואים את כל
 * השלבים בלי חיתוך ובלי גלילה אופקית.
 *
 * @param {{ label: string, steps: { id: string, label: string }[], current: string,
 *   onSelect?: (id: string) => void, disabled?: boolean, className?: string,
 *   doneText?: string, currentText?: string, backTitle?: (label: string) => string }} props
 * label — שם הרשימה לקורא המסך ("שלבי שליחת תזכורת").
 */
export default function Stepper({
  label, steps, current, onSelect, disabled = false, className,
  doneText = 'הושלם', currentText = 'השלב הנוכחי', backTitle = (name) => `חזור לשלב: ${name}`,
}) {
  const complete = current === STEPPER_COMPLETE
  const found = steps.findIndex((step) => step.id === current)
  if (!complete && found < 0 && process.env.NODE_ENV !== 'production') {
    console.warn(`Stepper: שלב לא מוכר "${current}" — מוצג השלב הראשון`)
  }
  const currentIndex = complete ? steps.length : Math.max(0, found)
  return (
    <ol aria-label={label} className={cx('@container flex min-w-0 items-start gap-2 @md:items-center', className)}>
      {steps.map((step, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        const number = (
          <span
            aria-hidden="true"
            className={cx(
              'flex size-7 shrink-0 items-center justify-center rounded-full text-label-md tabular-nums transition-colors',
              done && 'bg-secondary-container text-on-secondary-container',
              active && 'bg-primary text-on-primary ring-4 ring-primary/20',
              !done && !active && 'border border-outline-variant text-on-surface-variant'
            )}
          >
            {done ? <AppIcon name="check" className="text-icon-md" /> : index + 1}
          </span>
        )
        const text = (
          <span
            className={cx(
              'min-w-0 max-w-full truncate',
              active ? 'text-label-lg text-on-surface' : 'text-label-md text-on-surface-variant',
              '@max-md:text-label-sm'
            )}
          >
            {step.label}
            {done && <span className="sr-only"> ({doneText})</span>}
            {active && <span className="sr-only"> ({currentText})</span>}
          </span>
        )
        // צר: עיגול ומתחתיו השם; רחב: זה לצד זה
        const inner = 'flex min-w-0 flex-col items-center gap-1 @md:flex-row @md:gap-2'
        const canGoBack = done && Boolean(onSelect) && !disabled
        return (
          <li key={step.id} aria-current={active ? 'step' : undefined} className={cx('flex min-w-0 items-start gap-2 @md:items-center', index < steps.length - 1 && 'flex-1')}>
            {canGoBack ? (
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                title={backTitle(step.label)}
                className={cx('-m-1 min-h-(--touch-target) rounded-(--radius-control) p-1 transition-colors hover:bg-surface-selected', inner, FOCUS_RING)}
              >
                {number}
                {text}
              </button>
            ) : (
              <span className={cx('min-h-(--touch-target)', inner)}>
                {number}
                {text}
              </span>
            )}
            {index < steps.length - 1 && (
              // בצר — בגובה מרכז העיגול (14px), לא באמצע העיגול+השם
              <span aria-hidden="true" className={cx('mt-3.5 h-px min-w-3 flex-1 @md:mt-0', done ? 'bg-primary' : 'bg-outline-variant')} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
