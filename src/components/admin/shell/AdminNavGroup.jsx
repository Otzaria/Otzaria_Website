import { useId } from 'react'
import { navItemCount } from '@/lib/adminNav'
import AdminNavItem from './AdminNavItem'

/**
 * קבוצה בסרגל: כותרת קטנה (אם יש — קבוצה של פריט אחד מגיעה בלי כותרת, ראו adminNav.js)
 * ורשימת הפריטים. הכותרת אינה heading בכוונה: הסרגל קודם ל-h1 של העמוד ב-DOM, וכותרות
 * h2 כאן היו שוברות את סדר הכותרות. הרשימה מקושרת אליה ב-aria-labelledby.
 */
export default function AdminNavGroup({ group, counts, activeId, onNavigate }) {
  const labelId = useId()
  return (
    <div className={group.label ? 'pt-3' : undefined}>
      {group.label && (
        <span id={labelId} className="block px-3 pb-1 text-label-sm text-on-surface-variant">
          {group.label}
        </span>
      )}
      <ul aria-labelledby={group.label ? labelId : undefined} className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <AdminNavItem
            key={item.id}
            item={item}
            count={navItemCount(item, counts)}
            active={item.id === activeId}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  )
}
