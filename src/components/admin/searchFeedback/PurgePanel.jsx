'use client'

import { useRef, useState } from 'react'
import EventFilters from './EventFilters'
import { EMPTY_FILTERS, filtersToCriteria, formatDateTime } from './labels'

const PURGE_URL = '/api/search-feedback/admin/purge'

async function postPurge(body, dryRun) {
  const res = await fetch(dryRun ? `${PURGE_URL}?dryRun=1` : PURGE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) throw new Error(json?.error || 'הניקוי נכשל')
  return json
}

/**
 * ניקוי אירועים: תצוגה מקדימה (ספירה), הקלדת המספר כאישור ראשון, ואישור דפדפן שני.
 * כל שינוי במסננים מבטל את התצוגה המקדימה.
 */
export default function PurgePanel({ models, onPurged }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [keyId, setKeyId] = useState('')
  const [all, setAll] = useState(false)
  const [preview, setPreview] = useState(null)
  const [typedCount, setTypedCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', error: false })
  const revision = useRef(0)
  const previousPreviewId = useRef(null)

  const criteria = () => {
    if (all) return { all: true }
    const c = filtersToCriteria(filters, models)
    if (keyId.trim()) c.keyId = keyId.trim()
    return c
  }
  const resetPreview = () => {
    revision.current += 1
    setPreview(null)
    setTypedCount('')
    setMessage({ text: '', error: false })
  }

  const runPreview = async () => {
    setBusy(true)
    resetPreview()
    const requestedRevision = revision.current
    const requestedCriteria = criteria()
    try {
      const json = await postPurge({ ...requestedCriteria, ...(previousPreviewId.current ? { replacePreviewId: previousPreviewId.current } : {}) }, true)
      previousPreviewId.current = json.previewId || null
      if (revision.current === requestedRevision) {
        setPreview({ count: json.count, asOf: json.asOf, previewId: json.previewId, criteria: requestedCriteria })
      }
    } catch (err) {
      if (revision.current === requestedRevision) setMessage({ text: err.message, error: true })
    } finally {
      setBusy(false)
    }
  }

  const runPurge = async () => {
    if (!preview || Number(typedCount) !== preview.count || JSON.stringify(preview.criteria) !== JSON.stringify(criteria())) return
    if (!window.confirm(`למחוק לצמיתות ${preview.count.toLocaleString('he-IL')} אירועים? אין דרך לשחזר אותם.`)) return
    setBusy(true)
    try {
      const json = await postPurge({ ...preview.criteria, asOf: preview.asOf, previewId: preview.previewId, confirmCount: preview.count }, false)
      previousPreviewId.current = null
      setPreview(null)
      setTypedCount('')
      setMessage({ text: `נמחקו ${json.deleted.toLocaleString('he-IL')} אירועים`, error: false })
      onPurged()
    } catch (err) {
      setPreview(null)
      setMessage({ text: err.message, error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <h3 className="text-lg font-bold text-on-surface">ניקוי אירועים</h3>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={all} onChange={(e) => { setAll(e.target.checked); resetPreview() }} />
        <span>כל האירועים (מתעלם מהמסננים)</span>
      </label>
      {!all && (
        <>
          <EventFilters filters={filters} onChange={(f) => { setFilters(f); resetPreview() }} models={models} />
          <label className="flex items-center gap-2 text-sm">
            <span className="text-on-surface/70">מזהה התקנה:</span>
            <input
              type="text"
              dir="ltr"
              value={keyId}
              onChange={(e) => { setKeyId(e.target.value); resetPreview() }}
              className="border rounded-lg px-3 py-2 bg-white font-mono text-xs w-96 max-w-full"
            />
          </label>
        </>
      )}
      <button
        onClick={runPreview}
        disabled={busy}
        className="flex items-center gap-2 rounded-lg px-4 py-2 bg-surface hover:bg-surface-variant disabled:opacity-40"
      >
        <span className="material-symbols-outlined">search</span>
        <span>תצוגה מקדימה</span>
      </button>

      {preview && JSON.stringify(preview.criteria) === JSON.stringify(criteria()) && (
        <div className="rounded-xl border border-danger-600/40 p-3 space-y-2 text-sm">
          <p>
            יימחקו <strong>{preview.count.toLocaleString('he-IL')}</strong> אירועים
            (שנקלטו עד {formatDateTime(preview.asOf)}).
          </p>
          {preview.count > 0 && (
            <>
              <label className="flex items-center gap-2">
                <span>לאישור, הקלידו את מספר האירועים:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={typedCount}
                  onChange={(e) => setTypedCount(e.target.value)}
                  className="border rounded-lg px-3 py-1 bg-white w-32"
                />
              </label>
              <button
                onClick={runPurge}
                disabled={busy || Number(typedCount) !== preview.count}
                className="flex items-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-white disabled:opacity-40"
              >
                <span className="material-symbols-outlined">delete</span>
                <span>מחיקה לצמיתות</span>
              </button>
            </>
          )}
        </div>
      )}
      {message.text && <p className={`text-sm ${message.error ? 'text-danger-600' : 'text-success-800'}`}>{message.text}</p>}
    </div>
  )
}
