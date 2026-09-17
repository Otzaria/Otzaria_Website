'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { TYPE_LABELS, TRIGGER_LABELS, IssueStateBadge, formatDateTime } from './shared'

const PAGE_SIZE = 50

export default function AppReportsPage() {
  const [filters, setFilters] = useState({ type: '', trigger: '', issueState: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v)
    fetch(`/api/app-reports/admin/list?${params}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !json?.success) {
          setError(json?.error || 'טעינת הדיווחים נכשלה')
          setData(null)
        } else {
          setError('')
          setData(json)
        }
      })
      .catch(() => { if (!cancelled) setError('טעינת הדיווחים נכשלה') })
    return () => { cancelled = true }
  }, [filters, page, reloadKey])

  const updateFilter = (key, value) => {
    setData(null)
    setPage(1)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">דיווחים על התוכנה</h2>
          <p className="text-on-surface/60">
            {data ? `${data.total} דיווחים` : 'טוען...'}
            {data?.github && (
              <span className="mr-2">
                · issues ב-<span dir="ltr">{data.github.repo}</span>
                {!data.github.tokenConfigured && <span className="mr-2 text-danger-600 font-bold">(טוקן GitHub לא מוגדר)</span>}
                {data.github.tokenSetAt && <span className="mr-2">· הטוקן הונפק ב-<span dir="ltr">{data.github.tokenSetAt}</span></span>}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setData(null); setReloadKey((k) => k + 1) }}
          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-variant rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined">refresh</span>
          <span>רענן</span>
        </button>
      </div>

      <div className="glass rounded-2xl p-4 flex flex-wrap gap-4">
        <FilterSelect label="סוג" value={filters.type} onChange={(v) => updateFilter('type', v)} options={TYPE_LABELS} />
        <FilterSelect label="מקור" value={filters.trigger} onChange={(v) => updateFilter('trigger', v)} options={TRIGGER_LABELS} />
        <FilterSelect
          label="מצב issue"
          value={filters.issueState}
          onChange={(v) => updateFilter('issueState', v)}
          options={{ open: 'פתוח', closed: 'סגור', pending: 'ממתין ליצירה' }}
        />
      </div>

      {error && <div className="glass rounded-2xl p-4 text-danger-600">{error}</div>}

      {!data && !error ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : data && data.reports.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-on-surface/30 mb-4 block">bug_report</span>
          <h3 className="text-xl font-bold text-on-surface">אין דיווחים</h3>
        </div>
      ) : data && (
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full text-right">
            <thead className="border-b border-surface-variant text-sm text-on-surface/60">
              <tr>
                <th className="p-4">כותרת</th>
                <th className="p-4">סוג</th>
                <th className="p-4">מקור</th>
                <th className="p-4">גרסה</th>
                <th className="p-4">מערכת</th>
                <th className="p-4">Issue</th>
                <th className="p-4">התקבל</th>
              </tr>
            </thead>
            <tbody>
              {data.reports.map((r) => (
                <tr key={r.reportId} className="border-b border-surface-variant/50 hover:bg-surface-variant/40">
                  <td className="p-4 font-medium">
                    <Link href={`/library/admin/app-reports/${encodeURIComponent(r.reportId)}`} className="text-primary hover:underline">
                      {r.title}
                    </Link>
                    {r.hasEmail && <span className="material-symbols-outlined text-base text-on-surface/40 mr-2 align-middle" title="השאיר כתובת מייל">mail</span>}
                  </td>
                  <td className="p-4 text-sm">{TYPE_LABELS[r.type] || r.type}</td>
                  <td className="p-4 text-sm">{TRIGGER_LABELS[r.trigger] || r.trigger}</td>
                  <td className="p-4 text-sm" dir="ltr">{r.appVersion}</td>
                  <td className="p-4 text-sm" dir="ltr">{r.platform}</td>
                  <td className="p-4 text-sm"><IssueStateBadge report={r} /></td>
                  <td className="p-4 text-sm text-on-surface/60">{formatDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex justify-center items-center gap-3">
          <button disabled={page <= 1} onClick={() => { setData(null); setPage((p) => p - 1) }} className="px-4 py-2 glass rounded-lg disabled:opacity-40">הקודם</button>
          <span className="text-on-surface/70">עמוד {page} מתוך {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { setData(null); setPage((p) => p + 1) }} className="px-4 py-2 glass rounded-lg disabled:opacity-40">הבא</button>
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-on-surface/70">{label}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="border rounded-lg px-3 py-2 bg-white">
        <option value="">הכל</option>
        {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </label>
  )
}
