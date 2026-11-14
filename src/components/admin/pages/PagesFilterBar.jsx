'use client'

import FilterBar from '@/components/admin/list/FilterBar'
import SelectMenu from '@/components/ui/SelectMenu'
import { activeFilterCount, filterSummary } from '@/lib/adminPagesScreen/pagesQuery'
import { STALE_LABEL } from '@/lib/adminPagesScreen/pageTerms'

const PANEL_ID = 'pages-filters-panel'

/**
 * סרגל הסינון של "עמודים": מצב, ספר ומשתמש (בוררים עם חיפוש — יש עשרות ומאות), "בלי שינוי יותר מ-" (3 / 7 / 14
 * יום, נמדד מהשמירה האחרונה — בוחר גם מצב "בעבודה", ומתחת לכל אפשרות הסבר קצר), ו"נקה סינון". המסגרת (קיפול
 * בטלפון מאחורי "סינון (2)", ולידו — מה מסונן) — list/FilterBar, בלי חיפוש. disabled — פעולה מרובה באמצע.
 *
 * @param {{ query: any, options: { statuses: any[], books: any[], users: any[], stale: any[] }, onChange: (patch: object) => void,
 *   onClear: () => void, disabled?: boolean }} props
 */
export default function PagesFilterBar({ query, options, onChange, onClear, disabled = false }) {
  const count = activeFilterCount(query)
  const active = count > 0
  const summary = filterSummary(query, options)

  return (
    <FilterBar panelId={PANEL_ID} layout="pages" count={count} summary={summary} active={active} onClear={onClear} disabled={disabled}>
      <SelectMenu label="מצב" options={options.statuses} value={query.status} allLabel="הכול" searchable={false} disabled={disabled}
        onChange={(status) => onChange({ status: status || '' })} />
      <SelectMenu label="ספר" options={options.books} value={query.book} allLabel="כל הספרים" placeholder="כל הספרים" searchable searchPlaceholder="חפש ספר" disabled={disabled}
        emptyText="לא נמצא ספר" onChange={(book) => onChange({ book: book || '' })} />
      <SelectMenu label="משתמש" options={options.users} value={query.user} allLabel="כל המשתמשים" placeholder="כל המשתמשים" searchable searchPlaceholder="חפש משתמש" disabled={disabled}
        emptyText="לא נמצא משתמש" onChange={(user) => onChange({ user: user || '' })} />
      <SelectMenu label={STALE_LABEL} options={options.stale} value={query.stale ? String(query.stale) : ''} allLabel="בלי הגבלה" placeholder="בלי הגבלה" searchable={false} disabled={disabled}
        onChange={(stale) => onChange({ stale: Number(stale) || 0 })} />
    </FilterBar>
  )
}
