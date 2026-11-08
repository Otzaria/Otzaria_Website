import MenuButton from '@/components/ui/MenuButton'
import TitleOrnament from '@/components/ui/TitleOrnament'

/**
 * כותרת מסך ניהול — ה-h1 היחיד בעמוד (המעטפת כבר לא מוסיפה כותרת "ניהול" משלה): שם המסך בגופן
 * התצוגה (משקל 400 בלבד), קישוט הכותרת, שורת הסבר אחת, ובקצה — פעולה ראשית אחת (אם יש) ותפריט ⋮
 * להגדרות ולפעולות נדירות. tabIndex=-1 — יעד לפוקוס במעבר עמוד ברשימה. בטלפון שורת ההסבר ברוחב מלא מתחת
 * לכותרת ולפעולות — כך רוחב הפעולות לא משנה את גובה הכותרת (ולא מזיז את מה שמתחתיה בין לשוניות).
 *
 * @param {{ title: string, description?: import('react').ReactNode, action?: import('react').ReactNode,
 *   menuItems?: import('@/components/ui/MenuButton').MenuItem[], menuLabel?: string, id?: string }} props
 */
export default function AdminScreenHeader({ title, description, action, menuItems, menuLabel = 'עוד פעולות', id }) {
  const actions = action || menuItems?.length > 0
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
      <div className="flex w-fit min-w-0 flex-col">
        <h1 id={id} tabIndex={-1} className="font-display text-headline-md leading-tight text-on-surface outline-none">{title}</h1>
        <TitleOrnament className="ms-0 mt-2" ratio="100%" min="96px" />
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {menuItems?.length > 0 && <MenuButton label={menuLabel} items={menuItems} />}
        </div>
      )}
      {/* בטלפון — ברוחב מלא מתחת לכותרת ולפעולות (לא נדחס לצד הכפתורים); מ-sm — מתחת לכותרת בלבד (col-start-1 —
          גם כשאין פעולות, ההסבר לא עולה לעמודה שליד הכותרת) */}
      {description && <p className="col-span-full mt-3 text-body-md text-on-surface-variant sm:col-span-1 sm:col-start-1">{description}</p>}
    </div>
  )
}
