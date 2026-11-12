'use client'

import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { cx } from '@/components/ui/cx'
import {
  PAGE_STATUSES, pageLabel, statusChangeBlocked, statusChangeConfirm, statusLabel,
} from '@/lib/adminPagesScreen/pageTerms'

/**
 * "שנה מצב…" (מתפריט ⋮ של שורה): פנוי / בעבודה / הושלם, ומתחת — מה יקרה בדיוק (statusChangeConfirm, לפי מה שהשרת
 * באמת עושה: בלי נקודות, בלי מונה הספר, בלי הודעה). זה חלון האישור עצמו: הבחירה לא נשמרת עד "שנה ל…".
 * המצב הנוכחי — לא לבחירה; "בעבודה" בלי מתנדב — לא לבחירה (עם הסבר). "פנוי" — כפתור אדום. בהתחלה אין בחירה.
 *
 * @param {{ page: any, onConfirm: (status: string) => void, onCancel: () => void }} props
 */
export default function ChangeStatusDialog({ page, onConfirm, onCancel }) {
  const name = useId()
  // בלי בחירה מראש — כדי שלא ייבחר "פנוי" (הרסני) בלי שהתכוונו; האישור פעיל רק אחרי בחירה
  const [to, setTo] = useState('')
  const text = to ? statusChangeConfirm(page, to) : null
  const danger = text?.tone === 'danger'

  return (
    <Dialog
      title="שנה מצב"
      subtitle={`"${page.bookName}", ${pageLabel(page.number)} — עכשיו "${statusLabel(page.status)}"`}
      onClose={onCancel}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onCancel}>ביטול</Button>
          <Button variant={danger ? 'danger' : 'filled'} size="sm" softDisabled={!to} onClick={() => { if (to) onConfirm(to) }} data-confirm="">
            {text?.confirmLabel || 'שנה'}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4 text-start">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-label-lg text-on-surface">המצב החדש</legend>
          {PAGE_STATUSES.map((status) => {
            const blocked = statusChangeBlocked(page, status)
            return (
              <label
                key={status}
                className={cx(
                  'flex min-h-(--touch-target) items-center gap-3 rounded-(--radius-control) px-2',
                  blocked ? 'cursor-not-allowed text-on-surface-variant' : 'cursor-pointer text-on-surface hover:bg-surface-selected'
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={status}
                  checked={to === status}
                  disabled={Boolean(blocked)}
                  onChange={() => setTo(status)}
                  className="size-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-body-md">{statusLabel(status)}</span>
                  {blocked && <span className="block text-body-sm text-on-surface-variant">{blocked}</span>}
                </span>
              </label>
            )
          })}
        </fieldset>
        {/* אזור הכרזה קבוע — מה יקרה מוכרז כשבוחרים */}
        <div aria-live="polite" className="flex flex-col gap-2 text-body-md text-on-surface-variant">
          {text ? (
            <>
              <p>{text.body}</p>
              <ul className="flex list-disc flex-col gap-1 ps-5 text-body-sm">
                {text.details.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </>
          ) : <p className="text-body-sm">בחר מצב כדי לראות מה יקרה.</p>}
        </div>
      </div>
    </Dialog>
  )
}
