'use client'

import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import UiPager from '@/components/ui/Pager'
import BulkActionBar, { ACTION_BUTTON, ACTION_TEXT } from '@/components/admin/list/BulkActionBar'
import { fmt } from '../api'

// שורת הבחירה מעל הרשימה (admin/list/BulkActionBar): "בחר הכול בתצוגה", כמה מסומנות, ופעולות על המסומנות —
// "אשר" ואחריו "דחה" (אדום, אחרון). בלי בחירה — מספר השורות בתצוגה.
// בתצוגת "אושרו" אין מה לאשר או לדחות — רק מספר השורות (בלי "בחר הכול"; בשורות עצמן אין תיבת סימון).
export function BulkBar({ items, sel, setSel, busy, onApprove, onReject, total }) {
  const pending = items.filter((x) => x.status === 'submitted')
  const selectable = pending.length > 0 || sel.size > 0
  const all = pending.length > 0 && pending.every((x) => sel.has(x.id))
  const count = sel.size
  return (
    <BulkActionBar
      count={count}
      countText={count === 1 ? 'שורה אחת סומנה' : `${fmt(count)} שורות סומנו`}
      clearedText="הסימון בוטל"
      onClear={() => setSel(new Set())}
      selectAll={selectable && (
        <span className="flex size-(--touch-target) shrink-0 items-center justify-center">
          <Checkbox
            label="סמן את כל השורות בתצוגה"
            checked={all}
            indeterminate={!all && count > 0}
            disabled={!pending.length}
            onChange={(checked) => setSel(checked ? new Set(pending.map((x) => x.id)) : new Set())}
          />
        </span>
      )}
      idle={<span className="text-body-sm text-on-surface-variant tabular-nums">מוצגות {fmt(items.length)} מתוך {fmt(total)}</span>}
      actions={(
        <>
          <Button variant="text" size="sm" icon="done_all" softDisabled={busy} onClick={onApprove} aria-label="אשר את המסומנות" className={ACTION_BUTTON}>
            <span className={ACTION_TEXT}>אשר</span>
          </Button>
          <Button variant="text" size="sm" icon="block" softDisabled={busy} onClick={onReject} aria-label="דחה את המסומנות" className={`${ACTION_BUTTON} text-error`}>
            <span className={ACTION_TEXT}>דחה</span>
          </Button>
        </>
      )}
    />
  )
}

export function Pager({ data, setPage }) {
  if (!data || data.pages <= 1) return null
  return <UiPager page={data.page} pageCount={data.pages} onChange={setPage} className="self-center" />
}
