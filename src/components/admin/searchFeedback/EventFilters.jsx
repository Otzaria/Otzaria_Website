'use client'

import { EVENT_TYPE_LABELS, modelFromValue, modelLabel, modelValue, selectableModels } from './labels'

/** מסנני תאריך קליטה/סוג/מודל, משותפים לייצוא ולניקוי. */
export default function EventFilters({ filters, onChange, models }) {
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value })
  const choices = selectableModels(models)
  const selected = modelFromValue(filters.model)
  if (selected && !choices.some((m) => modelValue(m) === filters.model)) choices.push(selected)
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-on-surface/70">מתאריך קליטה:</span>
        <input type="date" value={filters.from} onChange={set('from')} className="border rounded-lg px-3 py-2 bg-white" />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-on-surface/70">עד (לא כולל):</span>
        <input type="date" value={filters.to} onChange={set('to')} className="border rounded-lg px-3 py-2 bg-white" />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-on-surface/70">סוג:</span>
        <select value={filters.type} onChange={set('type')} className="border rounded-lg px-3 py-2 bg-white">
          <option value="">הכל</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-on-surface/70">מודל:</span>
        <select value={filters.model} onChange={set('model')} className="border rounded-lg px-3 py-2 bg-white max-w-xs">
          <option value="">הכל</option>
          {choices.map((m) => <option key={modelValue(m)} value={modelValue(m)}>{modelLabel(m)}</option>)}
        </select>
      </label>
    </div>
  )
}
