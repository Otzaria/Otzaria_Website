'use client'

import { useId } from 'react'
import { FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { MAX_ORIGINAL, MAX_PROPOSED } from '@/lib/pageReports/rules'
import { EDIT_HINT } from '@/lib/adminPageReportsScreen/pageReportsTerms'

/**
 * עריכת הנוסח לפני האישור: "הטקסט שבספר" ו"התיקון", ממולאים במה שהמדווח כתב. problem — הודעת הבדיקה (אותם כללים
 * כמו בדיווח — errorTextsProblem), מחוברת לשדות.
 * @param {{ draft: { original: string, proposed: string }, onChange: (draft: { original: string, proposed: string }) => void,
 *   problem: string | null, context: string, disabled?: boolean }} props
 */
export default function EditVersionFields({ draft, onChange, problem, context, disabled = false }) {
  const ids = { original: useId(), proposed: useId(), hint: useId(), problem: useId() }
  const describedBy = problem ? `${ids.hint} ${ids.problem}` : ids.hint
  return (
    <div className="flex flex-col gap-2 rounded-(--radius-control) bg-surface-container-low p-3">
      <p id={ids.hint} className="text-body-sm text-on-surface-variant">{EDIT_HINT}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={ids.original} className={FIELD_LABEL}>הטקסט שבספר<span className="sr-only">{` — ${context}`}</span></label>
          <input id={ids.original} dir="rtl" value={draft.original} maxLength={MAX_ORIGINAL} disabled={disabled}
            aria-invalid={problem ? true : undefined} aria-describedby={describedBy}
            onChange={(e) => onChange({ ...draft, original: e.target.value })} className={fieldClasses()} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={ids.proposed} className={FIELD_LABEL}>התיקון<span className="sr-only">{` — ${context}`}</span></label>
          <input id={ids.proposed} dir="rtl" value={draft.proposed} maxLength={MAX_PROPOSED} disabled={disabled}
            aria-invalid={problem ? true : undefined} aria-describedby={describedBy}
            onChange={(e) => onChange({ ...draft, proposed: e.target.value })} className={fieldClasses()} data-autofocus="" />
        </div>
      </div>
      {problem && <p id={ids.problem} role="alert" className="text-body-sm text-error">{problem}</p>}
    </div>
  )
}
