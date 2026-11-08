'use client'

import FilterBar from '@/components/admin/list/FilterBar'
import SelectMenu from '@/components/ui/SelectMenu'
import { OWNER_FILTER_LABELS, STATUS_FILTER_LABELS, VISIBILITY_FILTER_LABELS, activeFilterCount } from '@/lib/adminBooks/booksQuery'

const PANEL_ID = 'books-filters-panel'

/**
 * סרגל הסינון: חיפוש (בשם הספר ובשם הבעלים; מקש "/" מתמקד בו), ובוררים (ui/SelectMenu) — מצב (אחד:
 * לא התחילו / בעבודה / הושלם), נראות (מוסתר / מוצג — בנפרד, כדי שאפשר יהיה "בעבודה וגלוי"), בעלות (אחד)
 * וקטגוריה (כמה, עם חיפוש ונקודת צבע) — ו"נקה סינון".
 * המסגרת (קיפול בטלפון, "מסונן: ...", "נקה סינון") — list/FilterBar.
 *
 * @param {{ query: any, onChange: (patch: object) => void, onClear: () => void, active: boolean,
 *   statusOptions: any[], visibilityOptions: any[], ownerOptions: any[], categoryOptions: any[] }} props
 */
export default function BooksFilterBar({ query, onChange, onClear, active, statusOptions, visibilityOptions, ownerOptions, categoryOptions }) {
  const count = activeFilterCount(query)
  const summary = [
    query.status && STATUS_FILTER_LABELS[query.status],
    query.vis && VISIBILITY_FILTER_LABELS[query.vis],
    query.owner && OWNER_FILTER_LABELS[query.owner],
    ...query.cat,
  ].filter(Boolean)

  return (
    <FilterBar
      panelId={PANEL_ID}
      layout="fill4"
      search={{ label: 'חיפוש לפי שם ספר או בעלים', placeholder: 'חפש ספר או בעלים', value: query.q, onSearch: (q) => onChange({ q }) }}
      count={count}
      summary={summary}
      active={active}
      onClear={onClear}
    >
      <SelectMenu label="מצב" options={statusOptions} value={query.status} allLabel="הכול" onChange={(status) => onChange({ status })} searchable={false} />
      <SelectMenu label="נראות" options={visibilityOptions} value={query.vis} allLabel="הכול" onChange={(vis) => onChange({ vis })} searchable={false} />
      <SelectMenu label="בעלות" options={ownerOptions} value={query.owner} allLabel="הכול" onChange={(owner) => onChange({ owner })} searchable={false} />
      <SelectMenu
        label="קטגוריה"
        multiple
        searchable
        searchPlaceholder="חפש קטגוריה"
        emptyText="אין קטגוריה בשם הזה"
        options={categoryOptions}
        value={query.cat}
        placeholder="כל הקטגוריות"
        onChange={(cat) => onChange({ cat })}
      />
    </FilterBar>
  )
}
