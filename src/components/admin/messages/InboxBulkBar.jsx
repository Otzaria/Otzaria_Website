'use client'

import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import BulkProgress from '@/components/admin/list/BulkProgress'
import { formatNumber } from '@/lib/adminTerms'
import { bulkProgressText, conversationsText } from '@/lib/adminMessagesScreen/messageTerms'
import { cx } from '@/components/ui/cx'

/** פעולה הרסנית בשורה — טקסט ואייקון באדום (כמו בהעלאות) */
const DANGER_TEXT = 'text-error! hover:bg-error-container/60!'

/**
 * שורת הכלים מעל "נכנסות": בלי בחירה — "בחר הכול" וכמה שיחות; עם בחירה — "סמן כנקרא" ו"מחק לצמיתות" (באדום,
 * אחרון). בזמן ריצה — "X מתוך Y" ו"עצור" במקום הכפתורים.
 *
 * @param {{ pageIds: string[], selected: Set<string>, onSelect: (ids: string[], checked: boolean) => void, onClear: () => void,
 *   total: number, working: boolean, onBulk: (action: 'read' | 'delete') => void, clearedText?: string,
 *   progress?: { action: string, done: number, total: number } | null, onStop?: () => void, selectAllId?: string }} props
 * selectAllId — ל"בחר הכול", כדי שהמסך יחזיר אליו את הפוקוס בסוף פעולה מרובה.
 */
export default function InboxBulkBar({ pageIds, selected, onSelect, onClear, total, working, onBulk, clearedText, progress, onStop, selectAllId }) {
  const pageSelected = pageIds.filter((id) => selected.has(id)).length
  const allOnPage = pageIds.length > 0 && pageSelected === pageIds.length
  const count = selected.size
  return (
    <BulkActionBar
      count={count}
      countText={count === 1 ? 'שיחה אחת נבחרה' : `${formatNumber(count)} נבחרו`}
      clearedText={clearedText}
      locked={Boolean(progress)}
      selectAll={(
        <Checkbox
          id={selectAllId}
          label={allOnPage ? 'בטל את הבחירה בעמוד' : 'בחר את כל השיחות בעמוד'}
          checked={allOnPage}
          indeterminate={pageSelected > 0 && !allOnPage}
          disabled={pageIds.length === 0 || Boolean(progress)}
          onChange={(checked) => onSelect(pageIds, checked)}
        />
      )}
      idle={<p role="status" className="min-w-0 flex-1 text-body-sm tabular-nums text-on-surface-variant">{conversationsText(total)}</p>}
      actions={progress ? (
        <BulkProgress text={bulkProgressText(progress.action, progress)} value={progress.done} max={progress.total} onStop={onStop} focusStop />
      ) : (
        <>
          <Button className={ACTION_BUTTON} variant="text" size="sm" icon="mark_email_read" disabled={working} onClick={() => onBulk('read')} aria-label="סמן את הנבחרות כנקראו">
            <span className={ACTION_TEXT}>סמן כנקרא</span>
          </Button>
          <Button className={cx(ACTION_BUTTON, DANGER_TEXT)} variant="text" size="sm" icon="delete_forever" disabled={working} onClick={() => onBulk('delete')} aria-label="מחק את הנבחרות לצמיתות">
            <span className={ACTION_TEXT}>מחק לצמיתות</span>
          </Button>
        </>
      )}
      onClear={onClear}
    />
  )
}
