'use client'

import FilterBar from '@/components/admin/list/FilterBar'
import SelectMenu from '@/components/ui/SelectMenu'
import { STATUS_FILTERS, activeFilters, statusCount } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { STATUS_LABELS } from '@/lib/adminPageReportsScreen/pageReportsTerms'

const PANEL_ID = 'page-reports-filters-panel'

/**
 * סינון הדיווחים בלשונית, כמו בשאר מסכי הניהול (list/FilterBar + ui/SelectMenu): מצב (ממתין / אושר / נדחה / הכול,
 * או ממתין / טופל / הכול — עם המונה של כל מצב) וספר (עם חיפוש), ו"נקה סינון" שמחזיר ל"ממתין" ולכל הספרים.
 * בטלפון — מקופל מאחורי "סינון", ולידו מה מסונן.
 * @param {{ query: any, counts: any, books: { value: string, label: string }[], onChange: (patch: object) => void }} props
 */
export default function PageReportsFilters({ query, counts, books, onChange }) {
  const statusOptions = STATUS_FILTERS[query.kind].map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
    count: statusCount(counts, query.kind, status),
  }))
  const bookLabel = books.find((b) => b.value === query.book)?.label || query.book
  const filters = activeFilters(query, STATUS_LABELS[query.status], bookLabel)
  return (
    <FilterBar panelId={PANEL_ID} layout="fixed2" count={filters.count} summary={filters.summary} active={filters.count > 0}
      onClear={() => onChange(filters.clearPatch)}>
      <SelectMenu label="מצב" options={statusOptions} value={query.status} searchable={false}
        onChange={(status) => onChange({ status: status || 'pending' })} />
      <SelectMenu label="ספר" options={books} value={query.book} allLabel="כל הספרים" placeholder="כל הספרים" searchable
        searchPlaceholder="חפש ספר" emptyText="לא נמצא ספר" onChange={(book) => onChange({ book: book || '' })} />
    </FilterBar>
  )
}
