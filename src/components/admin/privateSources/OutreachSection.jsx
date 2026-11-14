'use client'

import { useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import Chip from '@/components/ui/Chip'
import EmptyState from '@/components/ui/EmptyState'
import SearchField from '@/components/ui/SearchField'
import Skeleton from '@/components/ui/Skeleton'
import { formatNumber } from '@/lib/adminTerms'
import LoadError from '@/components/admin/list/LoadError'
import OutreachRow from './OutreachRow'
import { filterOutreachItems } from './outreachFilters'

/**
 * לשונית "פניות למכונים": מי פנה לאיזה מכון ומתי — כולל פניות שרק מתוכננות, כדי שכפילות תתגלה לפני הפנייה.
 * חיפוש, צ'יפים לפי מצב ו"חשד לכפילות", ורשימה. "פנייה חדשה" — בכותרת המסך; "פתח" בשורה — חלון העריכה (אצל המסך).
 * @param {{ outreach: ReturnType<typeof import('./useOutreach').default>, onEdit: (item: any) => void, onCreate: () => void }} props
 */
export default function OutreachSection({ outreach, onEdit, onCreate }) {
  const { items, statuses, channels, loading, error, duplicatesById, stats, load } = outreach
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [onlyDuplicates, setOnlyDuplicates] = useState(false)

  const filtered = useMemo(
    () => filterOutreachItems(items, { search, statusFilter, onlyDuplicates, duplicatesById }),
    [items, search, statusFilter, onlyDuplicates, duplicatesById]
  )
  const filtering = Boolean(search.trim() || statusFilter || onlyDuplicates)

  if (loading) {
    return (
      <div className={cardClasses({ className: 'flex flex-col gap-4 p-4' })} aria-busy="true" aria-label="טוען את הפניות">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}
      </div>
    )
  }
  if (error) return <LoadError error={error} title="לא הצלחנו לטעון את הפניות." onRetry={load} />

  const clear = () => { setSearch(''); setStatusFilter(''); setOnlyDuplicates(false) }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <SearchField label="חיפוש פניות" value={search} onSearch={setSearch} placeholder="מכון, איש קשר, טלפון, מייל, מי פנה או נושא" className="max-w-xl" />
        <div className="flex flex-wrap gap-x-2 gap-y-2.5" role="group" aria-label="סינון הפניות">
          <Chip selected={!statusFilter} count={stats.total} onClick={() => setStatusFilter('')}>הכול</Chip>
          {Object.entries(statuses).map(([key, config]) => (
            <Chip key={key} selected={statusFilter === key} count={stats.byStatus[key] || 0} onClick={() => setStatusFilter(key)}>{config.label}</Chip>
          ))}
          {stats.duplicates > 0 && (
            <Chip icon="warning" selected={onlyDuplicates} count={stats.duplicates} onClick={() => setOnlyDuplicates((v) => !v)}>חשד לכפילות</Chip>
          )}
        </div>
        <p className="text-body-sm tabular-nums text-on-surface-variant">
          {filtering ? `${formatNumber(filtered.length)} מתוך ${formatNumber(stats.total)} פניות` : `${formatNumber(stats.total)} פניות`}
          {stats.open > 0 && ` · ${formatNumber(stats.open)} פתוחות`}
        </p>
      </div>

      {filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState icon="contact_phone" title="עדיין לא נרשמו פניות"
            description="רשמו כאן גם פנייה שרק מתוכננת — כך אף אחד לא יפנה שוב לאותו אדם."
            actions={<Button variant="tonal" size="sm" icon="add" onClick={onCreate}>פנייה חדשה</Button>} />
        ) : (
          <EmptyState icon="search_off" title="אין פניות שמתאימות לסינון" actions={<Button variant="tonal" size="sm" onClick={clear}>נקה סינון</Button>} />
        )
      ) : (
        <ul className={cardClasses({ className: 'divide-y divide-outline-variant' })} aria-label="פניות למכונים">
          {filtered.map((item) => (
            <OutreachRow key={item._id} item={item} statuses={statuses} channels={channels} duplicates={duplicatesById.get(item._id) || []} onEdit={() => onEdit(item)} />
          ))}
        </ul>
      )}
    </div>
  )
}
