'use client'

import FilterBar from '@/components/admin/list/FilterBar'
import SelectMenu from '@/components/ui/SelectMenu'
import { activeFilterCount, UPLOAD_TYPE_FILTERS } from '@/lib/adminUploads/uploadsQuery'
import { UPLOAD_TYPE_FILTER_LABELS } from '@/lib/adminUploads/uploadTerms'

const TYPE_OPTIONS = UPLOAD_TYPE_FILTERS.map((value) => ({ value, label: UPLOAD_TYPE_FILTER_LABELS[value] }))

/**
 * סרגל הסינון: חיפוש בשם הספר (ראשון; מקש "/" מתמקד בו), ובוררים (ui/SelectMenu) — סוג (אחד),
 * מצב (כמה) ומשתמש (כמה, עם חיפוש בשם ובדואר) — ו"נקה סינון".
 * באשפה אין מצב ספר — אין בורר מצב, והשורה בשתי עמודות.
 * המסגרת (קיפול בטלפון, "מסונן: ...", "נקה סינון") — list/FilterBar.
 *
 * @param {{ query: any, onChange: (patch: object) => void, onClear: () => void, active: boolean,
 *   statusOptions?: { value: string, label: string, count: number, color?: string }[] | null,
 *   userOptions: { value: string, label: string, count: number, hint?: string }[] }} props
 * statusOptions — null באשפה.
 */
export default function UploadsFilterBar({ query, onChange, onClear, active, statusOptions, userOptions }) {
  const count = activeFilterCount(query)
  const panelId = 'uploads-filters-panel'
  const labelsOf = (options, values) => values.map((v) => options?.find((o) => o.value === v)?.label ?? v)
  const summary = [
    query.type && UPLOAD_TYPE_FILTER_LABELS[query.type],
    ...labelsOf(statusOptions, query.status),
    ...labelsOf(userOptions, query.user),
  ].filter(Boolean)

  return (
    <FilterBar
      panelId={panelId}
      layout={statusOptions ? 'fill3' : 'fill2'}
      search={{ label: 'חיפוש לפי שם ספר', placeholder: 'חפש לפי שם ספר', value: query.q, onSearch: (q) => onChange({ q }) }}
      count={count}
      summary={summary}
      active={active}
      onClear={onClear}
    >
      <SelectMenu label="סוג" options={TYPE_OPTIONS} value={query.type} allLabel="הכול" onChange={(type) => onChange({ type })} searchable={false} />
      {statusOptions && (
        <SelectMenu
          label="מצב"
          multiple
          options={statusOptions.filter((o) => o.count > 0 || query.status.includes(o.value))}
          value={query.status}
          placeholder="הכול"
          onChange={(status) => onChange({ status })}
        />
      )}
      <SelectMenu
        label="משתמש"
        multiple
        searchable
        searchPlaceholder="חפש שם או דואר"
        emptyText="אין משתמש בשם הזה"
        options={userOptions}
        value={query.user}
        placeholder="כל המשתמשים"
        onChange={(user) => onChange({ user })}
      />
    </FilterBar>
  )
}
