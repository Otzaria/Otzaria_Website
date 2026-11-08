'use client'

import FilterBar from '@/components/admin/list/FilterBar'
import SelectMenu from '@/components/ui/SelectMenu'
import { activeFilterCount } from '@/lib/adminPlugins/pluginsQuery'

/**
 * סרגל הסינון של "לאישור" ו"בחנות": חיפוש (שם, מפתח, תגית; מקש "/" מתמקד בו), ובוררים מעוצבים
 * (ui/SelectMenu) — ב"לאישור": סוג (חדש / עדכון); ב"בחנות": מצב (מוצג / מושהה) וקטגוריה — ו"נקה סינון".
 * המסגרת (קיפול בטלפון, "מסונן: ...", "נקה סינון") — list/FilterBar.
 *
 * @param {{ query: any, onChange: (patch: object) => void, onClear: () => void, active: boolean,
 *   selects: { id: string, label: string, options: { value: string, label: string, count?: number }[], allLabel: string }[] }} props
 */
export default function PluginsFilterBar({ query, onChange, onClear, active, selects }) {
  const count = activeFilterCount(query)
  const panelId = 'plugins-filters-panel'
  const summary = selects
    .map((s) => (query[s.id] ? s.options.find((o) => o.value === query[s.id])?.label : null))
    .filter(Boolean)

  return (
    <FilterBar
      panelId={panelId}
      layout={selects.length === 2 ? 'fixed2' : 'fixed1'}
      search={{ label: 'חיפוש תוסף', placeholder: 'חפש לפי שם, מפתח או תגית', value: query.q, onSearch: (q) => onChange({ q }) }}
      count={count}
      summary={summary}
      active={active}
      onClear={onClear}
    >
      {selects.map((s) => (
        <SelectMenu
          key={s.id}
          label={s.label}
          options={s.options}
          value={query[s.id]}
          allLabel={s.allLabel}
          onChange={(value) => onChange({ [s.id]: value || '' })}
          searchable={s.options.length > 8}
        />
      ))}
    </FilterBar>
  )
}
