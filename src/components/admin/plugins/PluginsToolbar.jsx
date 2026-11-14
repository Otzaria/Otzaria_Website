'use client'

import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import SelectMenu from '@/components/ui/SelectMenu'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import BulkProgress from '@/components/admin/list/BulkProgress'
import { formatNumber } from '@/lib/adminTerms'
import { bulkProgressText, pluginsCountText } from '@/lib/adminPlugins/pluginTerms'

const PENDING_SORT_OPTIONS = [
  { value: 'oldest', label: 'הוותיק קודם' },
  { value: 'newest', label: 'החדש קודם' },
  { value: 'name', label: 'לפי שם' },
]
const STORE_SORT_OPTIONS = [
  { value: 'name', label: 'לפי שם' },
  { value: 'updated', label: 'עודכן לאחרונה' },
  { value: 'downloads', label: 'הכי הרבה הורדות' },
  { value: 'rating', label: 'הדירוג הגבוה' },
]

const submissionsText = (n) => (n === 1 ? 'הגשה אחת' : `${formatNumber(n)} הגשות`)

/** שורת הכלים של "לאישור": כמה הגשות, ומיון (בלי בחירה — מחליטים על כל הגשה לחוד) */
export function PendingToolbar({ total, sort, onSortChange }) {
  return (
    <div className="flex min-h-14 items-center gap-2 px-1 sm:px-2">
      <p className="min-w-0 flex-1 text-body-sm tabular-nums text-on-surface-variant">{submissionsText(total)}</p>
      <SelectMenu variant="quiet" label="מיון" hideLabel options={PENDING_SORT_OPTIONS} value={sort} onChange={onSortChange} searchable={false} />
    </div>
  )
}

/**
 * שורת הכלים של "בחנות": בלי בחירה — "בחר הכול", כמה תוספים ומיון; עם בחירה — "השהה", "החזר לחנות"
 * ו"שבץ בקטגוריה" (שתיהן אפשר להחזיר — לכן בלי חלון אישור; ההשהיה מציגה "בטל").
 * בזמן הריצה (progress) — "X מתוך Y" ו"עצור" במקום הכפתורים. אין מחיקה מרובה — בכוונה.
 *
 * @param {{ pageIds: string[], selected: Set<string>, onSelect: (ids: string[], checked: boolean) => void, onClear: () => void,
 *   total: number, sort: string, onSortChange: (sort: string) => void, categoryOptions: { value: string, label: string }[],
 *   working: boolean, onBulk: (kind: 'suspend' | 'resume' | 'assign', value?: string) => void, clearedText?: string,
 *   progress?: { action: string, done: number, total: number } | null, onStop?: () => void }} props
 */
export function StoreBulkBar({ pageIds, selected, onSelect, onClear, total, sort, onSortChange, categoryOptions, working, onBulk, clearedText, progress, onStop }) {
  const pageSelected = pageIds.filter((id) => selected.has(id)).length
  const allOnPage = pageIds.length > 0 && pageSelected === pageIds.length
  const count = selected.size

  return (
    <BulkActionBar
      count={count}
      countText={count === 1 ? 'תוסף אחד נבחר' : `${formatNumber(count)} נבחרו`}
      clearedText={clearedText}
      selectAll={(
        <Checkbox
          label={allOnPage ? 'בטל את הבחירה בעמוד' : 'בחר את כל התוספים בעמוד'}
          checked={allOnPage}
          indeterminate={pageSelected > 0 && !allOnPage}
          disabled={pageIds.length === 0}
          onChange={(checked) => onSelect(pageIds, checked)}
        />
      )}
      idle={(
        <>
          <p className="min-w-0 flex-1 text-body-sm tabular-nums text-on-surface-variant">{pluginsCountText(total)}</p>
          <SelectMenu variant="quiet" label="מיון" hideLabel options={STORE_SORT_OPTIONS} value={sort} onChange={onSortChange} searchable={false} />
        </>
      )}
      actions={progress ? (
        <BulkProgress text={bulkProgressText(progress.action, progress)} value={progress.done} max={progress.total} onStop={onStop} />
      ) : (
        <>
          <Button className={ACTION_BUTTON} variant="text" size="sm" icon="pause_circle" disabled={working} onClick={() => onBulk('suspend')} aria-label="השהה את הנבחרים">
            <span className={ACTION_TEXT}>השהה</span>
          </Button>
          <Button className={ACTION_BUTTON} variant="text" size="sm" icon="play_circle" disabled={working} onClick={() => onBulk('resume')} aria-label="החזר את הנבחרים לחנות">
            <span className={ACTION_TEXT}>החזר לחנות</span>
          </Button>
          {categoryOptions.length > 0 && (
            <SelectMenu
              variant="action"
              label="שבץ את הנבחרים בקטגוריה"
              title="שבץ בקטגוריה"
              triggerText="שבץ בקטגוריה"
              textClassName={ACTION_TEXT}
              triggerClassName={ACTION_BUTTON}
              icon="category"
              options={categoryOptions}
              value={null}
              disabled={working}
              onChange={(value) => onBulk('assign', value)}
            />
          )}
        </>
      )}
      onClear={onClear}
    />
  )
}
