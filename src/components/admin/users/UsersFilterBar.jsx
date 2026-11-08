'use client'

import FilterBar from '@/components/admin/list/FilterBar'
import SelectMenu from '@/components/ui/SelectMenu'
import { SORT_LABELS, USER_SORTS, activeFilterCount, filterSummary, usersCountText } from '@/lib/adminUsersScreen/usersQuery'

const SORT_OPTIONS = USER_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))
const PANEL_ID = 'users-filters-panel'

/**
 * סרגל הסינון של "משתמשים": חיפוש (שם או דואר; מקש "/" מתמקד בו), תפקיד וצוות או חסימה בבוררים מעוצבים, ו"נקה
 * סינון". המסגרת (קיפול בטלפון, "מסונן: ...", "נקה סינון") — list/FilterBar; המספר על "סינון" — רק הבוררים.
 *
 * @param {{ query: any, onChange: (patch: object) => void, onClear: () => void,
 *   options: { roles: any[], teams: any[] } }} props
 */
export default function UsersFilterBar({ query, onChange, onClear, options }) {
  const selectCount = [query.role, query.team].filter(Boolean).length
  const active = activeFilterCount(query) > 0
  const summary = filterSummary({ ...query, q: '' })

  return (
    <FilterBar
      panelId={PANEL_ID}
      layout="fixed2"
      search={{ label: 'חיפוש משתמש', placeholder: 'חפש לפי שם או כתובת דואר', value: query.q, onSearch: (q) => onChange({ q }) }}
      count={selectCount}
      summary={summary}
      active={active}
      onClear={onClear}
    >
      <SelectMenu label="תפקיד" options={options.roles} value={query.role} allLabel="הכול" onChange={(role) => onChange({ role: role || '' })} searchable={false} />
      <SelectMenu label="צוות או חסימה" options={options.teams} value={query.team} allLabel="הכול" onChange={(team) => onChange({ team: team || '' })} searchable={false} />
    </FilterBar>
  )
}

/** שורת הכלים מעל הרשימה: כמה משתמשים (מוכרז לקורא המסך כשמשתנה — אחרי חיפוש או סינון), ומיון */
export function UsersToolbar({ total, sort, onSortChange }) {
  return (
    <div className="flex min-h-14 items-center gap-2 px-1 sm:px-2">
      <p role="status" className="min-w-0 flex-1 text-body-sm tabular-nums text-on-surface-variant">{usersCountText(total)}</p>
      <SelectMenu variant="quiet" label="מיון" hideLabel options={SORT_OPTIONS} value={sort} onChange={onSortChange} searchable={false} />
    </div>
  )
}
