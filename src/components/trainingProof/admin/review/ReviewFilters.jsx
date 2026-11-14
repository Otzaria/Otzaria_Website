'use client'

import { useId } from 'react'
import SelectMenu from '@/components/ui/SelectMenu'
import FilterBar from '@/components/admin/list/FilterBar'
import { clearedFilters, filterBarState } from './filterState'

// סרגל המסננים של הסקירה (זיהוי טקסט ונתב הכתב): בוררים מעוצבים (ui/SelectMenu) בסרגל המשותף של הניהול —
// בטלפון מקופלים מאחורי "סינון (2)", עם "נקה סינון". defs — ראו filterState.js.
export default function ReviewFilters({ filters, defs, onChange }) {
  const panelId = useId()
  const state = filterBarState(filters, defs)
  return (
    <FilterBar panelId={panelId} layout={defs.length === 4 ? 'fill4' : 'fill3'} {...state} onClear={() => onChange(clearedFilters(filters, defs))}>
      {defs.map((d) => (
        <SelectMenu
          key={d.key}
          label={d.label}
          options={d.options}
          value={filters[d.key]}
          allLabel={d.allLabel}
          placeholder={d.allLabel}
          searchable={d.options.length > 8}
          onChange={(v) => onChange({ ...filters, [d.key]: v || (d.empty ?? '') })}
          className="min-w-0"
        />
      ))}
    </FilterBar>
  )
}
