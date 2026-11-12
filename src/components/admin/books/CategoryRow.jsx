'use client'

import { useId } from 'react'
import Button from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'
import { FIELD_ERROR, fieldClasses } from '@/components/ui/fieldStyles'
import { DEFAULT_CATEGORY_NOTE, categoryBooksText } from '@/lib/adminBooks/categories'

/**
 * שורת קטגוריה לעריכה: צבע (בורר הצבע של הדפדפן, בתוך ריבוע 44px), שם, כמה ספרים בה, והסרה.
 * blockReason — למה אי אפשר להסיר (יש בה ספרים / ברירת המחדל): הכפתור מושבת, והסיבה ברמז ולקורא המסך
 * (ההסבר הכללי — שורה אחת מעל הרשימה, ולא בכל שורה).
 * שורה חדשה (שעוד לא נשמרה) — "חדשה" במקום מספר הספרים. count=null — מספר הספרים לא ידוע (לא נטענו).
 * nameLock — השם נעול (לקריאה בלבד): "default" ("כללי" — ומתחת שורה גלויה שאומרת למה, כי בטלפון אין
 * רמז בריחוף), או "unknown-books" (הספרים לא נטענו — ההסבר בשורה שמעל הרשימה).
 *
 * @param {{ row: { key: string, original: string | null, name: string, color: string }, count: number | null,
 *   blockReason: string | null, nameLock?: 'default' | 'unknown-books' | null, error?: string, disabled?: boolean,
 *   onChange: (patch: object) => void, onRemove: () => void }} props
 */
export default function CategoryRow({ row, count, blockReason, nameLock = null, error, disabled = false, onChange, onRemove }) {
  const nameId = useId()
  const colorId = useId()
  const reasonId = useId()
  const errorId = useId()
  const noteId = useId()
  const label = row.name.trim() || 'קטגוריה חדשה'
  const renamed = row.original && row.original !== row.name.trim() && row.name.trim()
  let countText = 'חדשה'
  if (row.original) countText = count === null ? '' : categoryBooksText(count)

  return (
    <li className="flex flex-col gap-1 px-2 py-2 sm:px-3">
      <div className="flex items-center gap-2 sm:gap-3">
        <label htmlFor={colorId} className={cx('relative flex size-(--touch-target) shrink-0 cursor-pointer items-center justify-center rounded-(--radius-control) hover:bg-surface-selected', 'has-focus-visible:outline-2 has-focus-visible:outline-primary')}>
          <span className="sr-only">הצבע של {label}</span>
          <span aria-hidden="true" className="size-6 rounded-full ring-1 ring-on-surface/20" style={{ backgroundColor: row.color }} />
          <input
            id={colorId}
            type="color"
            value={row.color}
            onChange={(e) => onChange({ color: e.target.value })}
            disabled={disabled}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <div className="min-w-0 flex-1">
          <label htmlFor={nameId} className="sr-only">שם הקטגוריה</label>
          <input
            id={nameId}
            data-category-name={row.key}
            type="text"
            value={row.name}
            placeholder="שם הקטגוריה"
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={disabled}
            readOnly={Boolean(nameLock)}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={cx(error && errorId, nameLock === 'default' && noteId) || undefined}
            className={fieldClasses({ invalid: Boolean(error), quiet: true, className: 'read-only:hover:border-transparent' })}
          />
        </div>
        <span className="hidden w-24 shrink-0 text-body-sm tabular-nums text-on-surface-variant sm:block">
          {countText}
        </span>
        <Button
          variant="text"
          size="sm"
          iconOnly
          icon="delete"
          aria-label={`הסר את ${label}`}
          aria-describedby={blockReason ? (nameLock === 'default' ? noteId : reasonId) : undefined}
          onClick={onRemove}
          disabled={disabled || Boolean(blockReason)}
          title={blockReason ? `אי אפשר להסיר: ${blockReason}` : undefined}
        />
      </div>
      <div className="flex flex-col gap-0.5 ps-[calc(var(--touch-target)+0.5rem)] sm:ps-[calc(var(--touch-target)+0.75rem)]">
        {countText && <p className="text-body-sm text-on-surface-variant sm:hidden">{countText}</p>}
        {nameLock === 'default' && <p id={noteId} className="text-body-sm text-on-surface-variant">{DEFAULT_CATEGORY_NOTE}</p>}
        {renamed && <p className="text-body-sm text-on-surface-variant">השם בשרת: &quot;{row.original}&quot;{count > 0 ? ` — ${categoryBooksText(count)} יעברו לשם החדש` : ''}</p>}
        {blockReason && nameLock !== 'default' && <p id={reasonId} className="sr-only">אי אפשר להסיר: {blockReason}</p>}
        {error && <p id={errorId} role="alert" className={FIELD_ERROR}>{error}</p>}
      </div>
    </li>
  )
}
