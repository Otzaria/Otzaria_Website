'use client'

import Button from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'

/**
 * שורת הכלים שמעל רשימה: בלי בחירה — תיבת "בחר הכול" ותוכן שקט (מספר תוצאות, מיון); עם בחירה —
 * "3 ספרים נבחרו", הפעולות המרובות ו"נקה בחירה", על משטח מודגש.
 *
 * דביקה (מתחת לכותרת האתר) רק כשיש בחירה — אז הפעולות צריכות להישאר זמינות בגלילה. בלי בחירה
 * השורה השקטה לא נדבקת: היא לא צריכה לגזול גובה, ולא להיחתך מעל הרשימה.
 * ברשימה צרה (טלפון) השורה הפעילה היא שורה אחת (~56px): הפעולות כאייקונים (השם נשאר נגיש —
 * הצרכן עוטף את הטקסט ב-ACTION_TEXT), והמונה מתקצר בחיתוך. extra ("בחר את כל 1,848") — בשורה
 * משלו כשאין מקום.
 *
 * הכרזה: אזור live קבוע (sr-only, role="status") שקיים גם כשאין בחירה — כדי שקורא המסך יכריז על
 * כל שינוי במספר הנבחרים, וגם על ביטול הבחירה ("הבחירה בוטלה").
 *
 * @param {{ count: number, countText: string, selectAll?: import('react').ReactNode,
 *   idle?: import('react').ReactNode, actions?: import('react').ReactNode, extra?: import('react').ReactNode,
 *   onClear: () => void, label?: string, className?: string, clearedText?: string, locked?: boolean }} props
 * locked — פעולה מרובה באמצע: "נקה בחירה" נעול (aria-disabled), כדי שהשורה עם "X מתוך Y" ו"עצור" לא תיעלם.
 */
export default function BulkActionBar({ count, countText, selectAll, idle, actions, extra, onClear, label = 'פעולות על הנבחרים', className, clearedText = '', locked = false }) {
  const active = count > 0
  return (
    <div className={cx('@container', active && 'sticky top-(--site-header-height) z-(--z-below-header)', className)}>
      <div
        role="group"
        aria-label={label}
        className={cx(
          // אותו ריפוד כמו השורות שמתחת (px-1 sm:px-2) — כדי שתיבת "בחר הכול" תהיה באותו קו עם תיבות השורות
          'flex min-h-14 flex-wrap items-center gap-x-1 gap-y-0 rounded-(--radius-control) px-1 py-1 sm:px-2',
          active
            ? 'bg-secondary-container text-on-secondary-container forced-colors:border forced-colors:border-[Highlight]'
            : 'bg-background'
        )}
      >
        <p role="status" className="sr-only">{active ? countText : clearedText}</p>
        {selectAll}
        {active ? (
          <>
            <span aria-hidden="true" className="min-w-0 flex-1 truncate text-label-lg tabular-nums @2xl:flex-none">{countText}</span>
            <div className="ms-auto flex shrink-0 items-center gap-0.5 @2xl:gap-1">
              {actions}
              <Button variant="text" size="sm" icon="close" onClick={onClear} softDisabled={locked} aria-label="נקה בחירה" className={ACTION_BUTTON}>
                <span className={ACTION_TEXT}>נקה בחירה</span>
              </Button>
            </div>
            {extra && <div className="flex w-full justify-start ps-11 @4xl:order-none @4xl:w-auto @4xl:ps-0">{extra}</div>}
          </>
        ) : idle}
      </div>
    </div>
  )
}

/** טקסט של פעולה בשורה הפעילה: נסתר ברשימה צרה (האייקון נשאר, והשם — ב-aria-label של הכפתור) */
export const ACTION_TEXT = '@max-2xl:sr-only'

/** ריפוד של כפתור פעולה בשורה הפעילה: קטן יותר ברשימה צרה, כשנשאר רק האייקון — כדי שהמונה לא ייחתך */
export const ACTION_BUTTON = '@max-2xl:px-2.5'
