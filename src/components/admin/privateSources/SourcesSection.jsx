'use client'

import { useMemo, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import Chip from '@/components/ui/Chip'
import EmptyState from '@/components/ui/EmptyState'
import Loader from '@/components/ui/Loader'
import Notice from '@/components/ui/Notice'
import SearchField from '@/components/ui/SearchField'
import Skeleton from '@/components/ui/Skeleton'
import { formatNumber } from '@/lib/adminTerms'
import LoadError from '@/components/admin/list/LoadError'
import { loginHref } from '@/components/admin/list/adminRequest'
import { BookRow, SetRow } from './SourceRows'
import { NO_RECORD, groupSourceItemsByCategory, matchesSourceItem } from './sourcesFilters'

/**
 * לשונית "מקורות": מי מסר כל ספר ובאילו תנאים. חיפוש, צ'יפים לפי מצב (עם מונים — במקום בורר ותיבת "ללא רשומה בלבד"),
 * הודעה על רשומות לספרים שכבר לא ב-GitHub, וקבוצות לפי קטגוריה. "פתח" בשורה — חלון העריכה (אצל המסך).
 * בזמן סנכרון עם GitHub — שורת "מסנכרן עם GitHub…" (role=status) מעל הרשימה. deletingPath — הרשומה שנמחקת כרגע.
 * @param {{ sources: ReturnType<typeof import('./usePrivateSources').default>, onEdit: (item: any) => void,
 *   onDeleteOrphan: (item: any) => void, deletingPath?: string | null }} props
 */
export default function SourcesSection({ sources, onEdit, onDeleteOrphan, deletingPath = null }) {
  const { items, orphans, options, loading, syncing, error, githubWarning, stats, load } = sources
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [expandedSets, setExpandedSets] = useState({})

  const groups = useMemo(
    () => groupSourceItemsByCategory(items.filter((item) => matchesSourceItem(item, { search, statusFilter }))),
    [items, search, statusFilter]
  )
  const visibleCount = groups.reduce((sum, g) => sum + g.count, 0)
  const filtered = Boolean(search.trim() || statusFilter)

  if (loading) {
    return (
      <div className={cardClasses({ className: 'flex flex-col gap-4 p-4' })} aria-busy="true" aria-label="טוען את רשימת הספרים מ-GitHub">
        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}
      </div>
    )
  }
  if (error && items.length === 0) return <LoadError error={error} title="לא הצלחנו לטעון את המקורות." onRetry={() => load()} />

  const statusChips = [
    { value: '', label: 'הכול', count: stats.total },
    { value: NO_RECORD, label: 'לא תועדו', count: stats.missing },
    ...Object.entries(options.statuses || {}).map(([key, config]) => ({ value: key, label: config.label, count: stats.byStatus[key] || 0 })),
  ]

  return (
    <div className="flex flex-col gap-4" aria-busy={syncing || undefined}>
      <p role="status" className={syncing ? 'flex items-center gap-2 text-body-sm text-on-surface-variant' : 'sr-only'}>
        {syncing && <><Loader size="inline" decorative />מסנכרן עם GitHub…</>}
      </p>
      {error && (
        <Notice tone="error" role="alert">
          {error.message}
          {error.sessionExpired && <> <a href={loginHref()} className="underline">התחבר</a></>}
        </Notice>
      )}
      {githubWarning && <Notice tone="warning" title="GitHub לא זמין כרגע">{githubWarning}</Notice>}

      <div className="flex flex-col gap-3">
        <SearchField label="חיפוש מקורות" value={search} onSearch={setSearch} placeholder="שם ספר או סט, נתיב, מי מסר או מי השיג את האישור" className="max-w-xl" />
        <div className="flex flex-wrap gap-x-2 gap-y-2.5" role="group" aria-label="סינון לפי מצב">
          {statusChips.map((c) => (
            <Chip key={c.value || 'all'} selected={statusFilter === c.value} count={c.count} onClick={() => setStatusFilter(c.value)}>{c.label}</Chip>
          ))}
        </div>
        <p className="text-body-sm tabular-nums text-on-surface-variant">
          {filtered ? `${formatNumber(visibleCount)} מתוך ${formatNumber(stats.total)} פריטים` : `${formatNumber(stats.total)} פריטים`}
          {stats.sets > 0 && ` · מהם ${formatNumber(stats.sets)} סטים`} (פריט = ספר בודד או סט)
        </p>
      </div>

      {/* בכשל GitHub כל רשומה נראית "נטושה" — ולכן ההודעה מוסתרת כדי לא להטעות */}
      {!githubWarning && orphans.length > 0 && (
        <Notice tone="info" title={orphans.length === 1 ? 'פרטי מקור של ספר אחד שכבר לא נמצא ב-GitHub' : `פרטי מקור של ${formatNumber(orphans.length)} ספרים שכבר לא נמצאים ב-GitHub`}>
          <ul className="mt-2 flex flex-col gap-1">
            {orphans.map((orphan) => (
              <li key={orphan.bookPath} className="flex flex-wrap items-center gap-x-3">
                <span className="min-w-0 flex-1 truncate">{orphan.bookTitle} <span className="text-body-sm opacity-80" dir="auto">{orphan.bookPath}</span></span>
                <Button variant="text" size="sm" icon="delete" className="text-error" onClick={() => onDeleteOrphan(orphan)}
                  softDisabled={Boolean(deletingPath)} aria-label={`מחק את פרטי המקור של ${orphan.bookTitle}`}>
                  {deletingPath === orphan.bookPath ? 'מוחק…' : 'מחק'}
                </Button>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {groups.length === 0 ? (
        <EmptyState icon="search_off" title="אין ספרים שמתאימים לסינון"
          actions={filtered ? <Button variant="tonal" size="sm" onClick={() => { setSearch(''); setStatusFilter('') }}>נקה סינון</Button> : undefined} />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const open = !collapsed[group.category]
            return (
              <section key={group.category} className={cardClasses({ className: 'overflow-hidden' })} aria-label={group.category}>
                <button type="button" onClick={() => setCollapsed((p) => ({ ...p, [group.category]: !p[group.category] }))} aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-(--card-bg-hover)">
                  <span className="flex items-center gap-2 text-title-md text-on-surface">
                    {group.category}
                    <span className="text-body-sm tabular-nums text-on-surface-variant">({formatNumber(group.count)})</span>
                  </span>
                  <AppIcon name={open ? 'expand_less' : 'expand_more'} className="text-icon-lg text-on-surface-variant" />
                </button>
                {open && (
                  <ul className="divide-y divide-outline-variant border-t border-outline-variant">
                    {group.rows.map((item) => (item.kind === 'set' ? (
                      <SetRow key={item.bookPath} item={item} options={options} expanded={Boolean(expandedSets[item.bookPath])}
                        onToggle={() => setExpandedSets((p) => ({ ...p, [item.bookPath]: !p[item.bookPath] }))}
                        onEdit={() => onEdit(item)} onEditMember={(member) => onEdit({ ...member, kind: 'book' })} />
                    ) : (
                      <BookRow key={item.bookPath} item={item} options={options} onEdit={() => onEdit(item)} />
                    )))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
