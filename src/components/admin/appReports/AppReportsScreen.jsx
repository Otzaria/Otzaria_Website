'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import SelectMenu from '@/components/ui/SelectMenu'
import Skeleton from '@/components/ui/Skeleton'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import ListPager from '@/components/admin/list/ListPager'
import LoadError from '@/components/admin/list/LoadError'
import { requestJson } from '@/components/admin/list/adminRequest'
import {
  EMPTY_FILTERS, ISSUE_STATE_LABELS, PRODUCT_LABELS, TRIGGER_LABELS, TYPE_LABELS, hasActiveFilters, listQuery, optionsOf, pageInfo, reportsCountText,
} from '@/lib/adminAppReportsScreen/appReportsTerms'
import ReportRow from './ReportRow'
import { adminScreenTitle } from '@/lib/adminNav'

const FILTERS = [
  { key: 'product', label: 'מוצר', options: optionsOf(PRODUCT_LABELS) },
  { key: 'type', label: 'סוג', options: optionsOf(TYPE_LABELS) },
  { key: 'trigger', label: 'מקור', options: optionsOf(TRIGGER_LABELS) },
  { key: 'issueState', label: 'כרטיס ב-GitHub', options: optionsOf(ISSUE_STATE_LABELS) },
]

const LOAD_FAILED = 'לא הצלחנו לטעון את הדיווחים.'

function Repos({ github }) {
  const repos = github.repos || [{ product: 'otzaria', repo: github.repo }]
  return (
    <>
      {' '}לכל דיווח נפתח כרטיס ב-GitHub, במאגר של התוכנה שממנה נשלח
      <span className="sr-only">
        {' '}({repos.map((r) => r.repo).join(', ')})
      </span>.
    </>
  )
}

/**
 * מסך "דיווחי תקלות" (/library/admin/app-reports): דיווחים שנשלחו מהתוכנה — סינון (מוצר, סוג, מקור, כרטיס ב-GitHub),
 * רשימה ועימוד. אותה בקשה כמו קודם: GET /api/app-reports/admin/list?page&limit&מסננים. ⋮: רענן.
 * למפתח זה המסך היחיד (ההפניה מהלוח — ב-proxy).
 */
export default function AppReportsScreen() {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    // requestJson: הפניה לדף ההתחברות / 401 — "פג תוקף" (LoadError מציג "התחבר"); שבת ושגיאת שרת — בעברית
    requestJson(`/api/app-reports/admin/list?${listQuery(filters, page)}`, { fallback: LOAD_FAILED })
      .then((json) => {
        if (cancelled) return
        setError(null)
        setData(json)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err)
        setData(null)
      })
    return () => { cancelled = true }
  }, [filters, page, reloadKey])

  const reload = () => { setData(null); setError(null); setReloadKey((k) => k + 1) }
  const updateFilter = (key, value) => {
    setData(null)
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value || '' }))
  }
  const clearFilters = () => { setData(null); setPage(1); setFilters(EMPTY_FILTERS) }
  const goTo = (p) => { setData(null); setPage(p) }

  const info = data ? pageInfo(data.total, page) : null

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        title={adminScreenTitle('app-reports')}
        description={<>דיווחים שנשלחו מהתוכנה: תקלות, קריסות והצעות.{data?.github && <Repos github={data.github} />}</>}
        menuItems={[{ id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: reload }]}
      />
      {data?.github && !data.github.tokenConfigured && (
        <Notice tone="error" title="אין חיבור ל-GitHub">לא הוגדר מפתח גישה ל-GitHub, ולכן לא נפתחים כרטיסים לדיווחים חדשים.</Notice>
      )}
      {/* בטלפון — שני בוררים בשורה ברוחב מלא (לא בחצי רוחב, אחד מתחת לשני); מ-sm — בשורה אחת */}
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap" role="group" aria-label="סינון הדיווחים">
        {FILTERS.map((f) => (
          <SelectMenu key={f.key} label={f.label} options={f.options} value={filters[f.key]} onChange={(v) => updateFilter(f.key, v)}
            allLabel="הכול" placeholder="הכול" searchable={false} className="w-full min-w-0 sm:w-44" />
        ))}
        {hasActiveFilters(filters) && <Button variant="text" size="sm" icon="filter_alt_off" onClick={clearFilters} className="max-sm:col-span-2 max-sm:justify-self-start">נקה סינון</Button>}
        {data && <p className="text-body-sm tabular-nums text-on-surface-variant max-sm:col-span-2 sm:ms-auto">{reportsCountText(data.total)}</p>}
      </div>

      {error ? (
        <LoadError error={error} title={LOAD_FAILED} onRetry={reload} />
      ) : !data ? (
        <div className={cardClasses({ className: 'flex flex-col gap-4 p-4' })} aria-busy="true" aria-label="טוען">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : data.reports.length === 0 ? (
        <EmptyState icon="bug_report" title={hasActiveFilters(filters) ? 'אין דיווחים שמתאימים לסינון' : 'אין דיווחים'}
          actions={hasActiveFilters(filters) ? <Button variant="tonal" size="sm" onClick={clearFilters}>נקה סינון</Button> : undefined} />
      ) : (
        <ul className={cardClasses({ className: 'divide-y divide-outline-variant' })} aria-label="דיווחי תקלות">
          {data.reports.map((r) => <ReportRow key={r.reportId} report={r} />)}
        </ul>
      )}

      {info && <ListPager page={info} onChange={goTo} prefix="דיווחים" />}
    </div>
  )
}
