'use client'

import FilterBar from '@/components/admin/list/FilterBar'
import SelectMenu from '@/components/ui/SelectMenu'
import { filterSummary } from '@/lib/adminSuggestions/suggestionsQuery'
import { FILTER_LABELS } from './suggestionsScreenText'

/**
 * סינון ההצעות: ספר · מציע · סוג — בוררים מעוצבים (ui/SelectMenu, עם מונה ליד כל אפשרות), ו"נקה סינון".
 * המסגרת (קיפול בטלפון מאחורי "סינון (1)", ולידו — מה מסונן) — list/FilterBar, בלי חיפוש.
 * hideClear — כשאין תוצאות, "נקה סינון" נמצא במצב הריק (פעם אחת במסך, לא פעמיים).
 * disabled — פעולה מרובה באמצע: הסינון נעול, כדי שהרשימה (ו"עצור") לא יתחלפו באמצע.
 *
 * @param {{ query: any, options: { books: any[], authors: any[], kinds: any[] }, onChange: (patch: object) => void,
 *   onClear: () => void, count: number, hideClear?: boolean, disabled?: boolean }} props
 */
export default function SuggestionsFilterBar({ query, options, onChange, onClear, count, hideClear = false, disabled = false }) {
  const panelId = 'suggestions-filters-panel'
  const selects = [
    { id: 'book', label: FILTER_LABELS[0], options: options.books, searchable: true },
    { id: 'author', label: FILTER_LABELS[1], options: options.authors, searchable: options.authors.length > 8 },
    { id: 'kind', label: FILTER_LABELS[2], options: options.kinds, searchable: false },
  ]
  const summary = filterSummary(query, options)
  const showClear = count > 0 && !hideClear

  return (
    <FilterBar panelId={panelId} layout="fill3" count={count} summary={summary} active={showClear} onClear={onClear} disabled={disabled}>
      {selects.map((s) => (
        <SelectMenu
          key={s.id}
          label={s.label}
          options={s.options}
          value={query[s.id]}
          allLabel="הכול"
          onChange={(value) => onChange({ [s.id]: value || '' })}
          searchable={s.searchable}
          disabled={disabled}
        />
      ))}
    </FilterBar>
  )
}
