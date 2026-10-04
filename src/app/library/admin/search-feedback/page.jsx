'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import CountTable from '@/components/admin/searchFeedback/CountTable'
import KeysTable from '@/components/admin/searchFeedback/KeysTable'
import ExportPanel from '@/components/admin/searchFeedback/ExportPanel'
import PurgePanel from '@/components/admin/searchFeedback/PurgePanel'
import { EVENT_TYPE_LABELS, formatDateTime, modelLabel } from '@/components/admin/searchFeedback/labels'

export default function SearchFeedbackPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  // fresh=true עוקף את מטמון הסטטיסטיקה בשרת (רענון ידני / אחרי שינוי)
  const [reload, setReload] = useState({ key: 0, fresh: false })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/search-feedback/admin/stats${reload.fresh ? '?fresh=1' : ''}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !json?.success) {
          setError(json?.error || 'טעינת הנתונים נכשלה')
          setData(null)
        } else {
          setError('')
          setData(json)
        }
      })
      .catch(() => { if (!cancelled) setError('טעינת הנתונים נכשלה') })
    return () => { cancelled = true }
  }, [reload])

  const refresh = () => setReload((r) => ({ key: r.key + 1, fresh: true }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">משוב מהחיפוש הסמנטי</h2>
          <p className="text-on-surface/60">
            {data
              ? `${data.totalEvents.toLocaleString('he-IL')} אירועים · ${data.keys.total} התקנות (${data.keys.blocked} חסומות) · נכון ל-${formatDateTime(data.cachedAt)}`
              : 'טוען...'}
            {data && !data.enabled && (
              <span className="mr-2 font-bold text-danger-600">(הקליטה כבויה — <span dir="ltr">SEARCH_FEEDBACK_ENABLED</span>)</span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setData(null); refresh() }}
          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-variant rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined">refresh</span>
          <span>רענן</span>
        </button>
      </div>

      {error && <div className="glass rounded-2xl p-4 text-danger-600">{error}</div>}

      {!data && !error ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : data && (
        <>
          <ExportPanel models={data.byModel} />
          <div className="grid gap-4 md:grid-cols-2">
            <CountTable
              title="לפי סוג אירוע"
              rows={data.byType.map((r) => ({ key: r.type, label: EVENT_TYPE_LABELS[r.type] || r.type, count: r.count }))}
            />
            <CountTable
              title="לפי יום קליטה (30 הימים האחרונים)"
              rows={data.byDay.map((r) => ({ key: r.day, label: r.day, ltr: true, count: r.count }))}
            />
            <CountTable
              title="לפי מודל"
              rows={data.byModel.map((r) => ({
                key: `${r.modelFamilyId}|${r.modelQuantization}`,
                label: modelLabel(r),
                ltr: Boolean(r.modelFamilyId),
                count: r.count,
              }))}
            />
            <CountTable
              title="לפי גרסת תוכנה"
              rows={data.byAppVersion.map((r) => ({ key: String(r.appVersion), label: r.appVersion || 'לא ידוע', ltr: Boolean(r.appVersion), count: r.count }))}
            />
          </div>
          <KeysTable keys={data.topKeys} onChanged={refresh} />
          <PurgePanel models={data.byModel} onPurged={refresh} />
        </>
      )}
    </div>
  )
}
