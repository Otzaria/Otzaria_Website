'use client'

import { useEffect, useRef } from 'react'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import SelectMenu from '@/components/ui/SelectMenu'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import BulkProgress from '@/components/admin/list/BulkProgress'
import { formatNumber } from '@/lib/adminTerms'
import { bulkProgressText, suggestionsCountText } from '@/lib/adminSuggestions/suggestionTerms'

const SORT_OPTIONS = [
  { value: 'newest', label: 'החדשה קודם' },
  { value: 'oldest', label: 'הוותיקה קודם' },
]

const SELECT_ALL_ID = 'suggestions-select-all'
const APPROVE_ID = 'suggestions-bulk-approve'

/**
 * שורת הכלים מעל ההצעות: בלי בחירה — "בחר הכול" (בעמוד), כמה הצעות ומיון; עם בחירה — "אשר נבחרים" ו"דחה
 * נבחרים". בזמן הריצה — "X מתוך Y" ו"עצור" במקום הכפתורים (BulkProgress, כמו בתוספים), והפוקוס עובר
 * ל"עצור"; בסוף — חזרה ל"אשר נבחרים" (כשנשאר מה שלא עודכן) או ל"בחר הכול". בזמן הריצה הבחירה והמיון נעולים,
 * כדי שהשורה עם "עצור" לא תיעלם. disabled — המסך ננעל (אין הרשאה / ההתחברות פגה).
 *
 * @param {{ pageIds: string[], selected: Set<string>, onSelect: (ids: string[], checked: boolean) => void, onClear: () => void,
 *   clearedText?: string, total: number, sort: string, onSortChange: (sort: string) => void, working: boolean, disabled?: boolean,
 *   onBulk: (action: 'approve' | 'reject') => void, progress?: { action: string, done: number, total: number } | null, onStop?: () => void }} props
 */
export default function SuggestionsToolbar({ pageIds, selected, onSelect, onClear, clearedText, total, sort, onSortChange, working, disabled = false, onBulk, progress, onStop }) {
  const pageSelected = pageIds.filter((id) => selected.has(id)).length
  const allOnPage = pageIds.length > 0 && pageSelected === pageIds.length
  const count = selected.size
  const running = Boolean(progress)

  // סוף הריצה: "עצור" נעלם — הפוקוס חוזר לשורה, לא לתחילת הדף
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) {
      const active = document.activeElement
      if (!active || active === document.body) (document.getElementById(APPROVE_ID) || document.getElementById(SELECT_ALL_ID))?.focus()
    }
    wasRunning.current = running
  }, [running])

  return (
    <BulkActionBar
      count={count}
      countText={count === 1 ? 'הצעה אחת נבחרה' : `${formatNumber(count)} נבחרו`}
      clearedText={clearedText}
      label="פעולות על ההצעות שנבחרו"
      locked={running}
      selectAll={(
        <Checkbox
          id={SELECT_ALL_ID}
          label={allOnPage ? 'בטל את הבחירה בעמוד' : 'בחר את כל ההצעות בעמוד'}
          checked={allOnPage}
          indeterminate={pageSelected > 0 && !allOnPage}
          disabled={pageIds.length === 0 || running || disabled}
          onChange={(checked) => onSelect(pageIds, checked)}
        />
      )}
      idle={(
        <>
          <p className="min-w-0 flex-1 text-body-sm tabular-nums text-on-surface-variant">{suggestionsCountText(total)}</p>
          <SelectMenu variant="quiet" label="מיון" hideLabel options={SORT_OPTIONS} value={sort} onChange={onSortChange} searchable={false} />
        </>
      )}
      actions={progress ? (
        <BulkProgress text={bulkProgressText(progress.action, progress)} value={progress.done} max={progress.total} onStop={onStop} focusStop />
      ) : (
        <>
          <Button id={APPROVE_ID} className={ACTION_BUTTON} variant="text" size="sm" icon="check" softDisabled={working || disabled} onClick={() => onBulk('approve')} aria-label="אשר את הנבחרים">
            <span className={ACTION_TEXT}>אשר נבחרים</span>
          </Button>
          <Button className={ACTION_BUTTON} variant="text" size="sm" icon="close" softDisabled={working || disabled} onClick={() => onBulk('reject')} aria-label="דחה את הנבחרים">
            <span className={ACTION_TEXT}>דחה נבחרים</span>
          </Button>
        </>
      )}
      onClear={onClear}
    />
  )
}
