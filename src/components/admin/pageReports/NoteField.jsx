'use client'

import { useId } from 'react'
import { fieldClasses } from '@/components/ui/fieldStyles'
import { MAX_NOTE } from '@/lib/pageReports/rules'

/**
 * הערת מנהל אופציונלית (המדווח יראה אותה בעורך). context — לשם הנגיש, כדי שבכל כרטיס יהיה שם ייחודי.
 * @param {{ value: string, onChange: (v: string) => void, context: string, disabled?: boolean }} props
 */
export default function NoteField({ value, onChange, context, disabled = false }) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-label-md text-on-surface-variant">
        הערה למדווח (לא חובה)<span className="sr-only">{` — ${context}`}</span>
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={MAX_NOTE} disabled={disabled} className={fieldClasses()} />
    </div>
  )
}
