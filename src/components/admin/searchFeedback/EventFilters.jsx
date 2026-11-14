'use client'

import { useId } from 'react'
import SelectMenu from '@/components/ui/SelectMenu'
import { FIELD_LABEL_COMPACT, fieldClasses } from '@/components/ui/fieldStyles'
import { EVENT_TYPE_LABELS, modelFromValue, modelLabel, modelValue, selectableModels } from './labels'

const TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => ({ value, label }))

function DateField({ label, value, onChange, disabled }) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col">
      <label htmlFor={id} className={FIELD_LABEL_COMPACT}>{label}</label>
      <input id={id} type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={fieldClasses({ className: 'w-full min-w-0' })} />
    </div>
  )
}

/** מסנני תאריך קליטה / סוג / מודל — משותפים להורדה ולניקוי. ערכי המסננים כמו קודם (labels.js). disabled — בזמן בקשה. */
export default function EventFilters({ filters, onChange, models, disabled = false }) {
  const set = (key) => (value) => onChange({ ...filters, [key]: value ?? '' })
  const choices = selectableModels(models)
  const selected = modelFromValue(filters.model)
  if (selected && !choices.some((m) => modelValue(m) === filters.model)) choices.push(selected)
  const modelOptions = choices.map((m) => ({ value: modelValue(m), label: modelLabel(m) }))
  return (
    // רשת של שניים — העמודות מתיישרות (תאריכים מעל הבוררים), ובטלפון בלי גלילה לרוחב
    <div className="grid grid-cols-2 items-end gap-3">
      <DateField label="מתאריך קליטה" value={filters.from} onChange={set('from')} disabled={disabled} />
      <DateField label="עד תאריך (לא כולל)" value={filters.to} onChange={set('to')} disabled={disabled} />
      <SelectMenu label="סוג" options={TYPE_OPTIONS} value={filters.type} onChange={set('type')} allLabel="הכול" placeholder="הכול" searchable={false} disabled={disabled} className="w-full min-w-0" />
      <SelectMenu label="מודל" options={modelOptions} value={filters.model} onChange={set('model')} allLabel="הכול" placeholder="הכול" disabled={disabled} className="w-full min-w-0" />
    </div>
  )
}
