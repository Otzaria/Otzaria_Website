'use client'

import AppIcon from './AppIcon'
import { cx } from './cx'
import { FOCUS_RING_INSET } from './focusRing'

/**
 * רשימת פעולות שקטה — אותם פריטים כמו בתפריט ⋮ (MenuButton), אבל גלויים בעמוד או במגירה: שורות של
 * 44px עם אייקון, בלי מסגרת לכל כפתור, על משטח אחד. מפריד ({ separator: true }) מתחיל קבוצה חדשה (קו
 * דק). danger — באדום (פעולה הרסנית; לשים אחרונה, אחרי מפריד). disabled — מושבת, והשם אומר למה: aria-disabled
 * ולא disabled, כדי שהפריט יישאר בסדר ה-Tab ומשתמש מקלדת / קורא מסך ישמע את ההסבר (כמו בתפריט ⋮).
 *
 * @param {{ items: ({ id: string, icon?: string, label: string, onSelect: () => void, disabled?: boolean,
 *   danger?: boolean } | { separator: true, id?: string })[], label: string, className?: string }} props
 */
export default function ActionList({ items, label, className }) {
  const groups = []
  let current = []
  for (const item of items) {
    if (item.separator) {
      if (current.length) groups.push(current)
      current = []
    } else {
      current.push(item)
    }
  }
  if (current.length) groups.push(current)

  return (
    <div role="group" aria-label={label} className={cx('overflow-hidden rounded-(--radius-control) bg-surface', className)}>
      {groups.map((group, index) => (
        <ul key={group[0].id} className={cx('py-1', index > 0 && 'border-t border-outline-variant/60')}>
          {group.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={item.disabled ? undefined : item.onSelect}
                aria-disabled={item.disabled || undefined}
                className={cx(
                  'flex min-h-(--touch-target) w-full items-center gap-3 px-3 text-start text-body-md transition-colors',
                  item.disabled ? 'cursor-not-allowed opacity-(--button-disabled-opacity)' : 'hover:bg-surface-selected',
                  item.danger ? 'text-error' : 'text-on-surface',
                  FOCUS_RING_INSET
                )}
              >
                {item.icon && (
                  <AppIcon name={item.icon} className={cx('shrink-0 text-icon-lg', item.danger ? 'text-error' : 'text-on-surface-variant')} />
                )}
                <span className="min-w-0 flex-1">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}
