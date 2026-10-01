'use client'

import { useEffect, useMemo, useState } from 'react'
import { BOOK_INFO_FIELD_LABELS, formatBookInfoValue } from './bookInfoDisplay'

/**
 * התור הישן של הצעות מידע-על-ספרים (BookInfoPendingChange), מלפני שכל עריכה נפתחה כ-PR.
 * אישור ל-Mongo כבר אינו קיים: הצעה מועברת ל-PR (בשם מי שהציע אותה) או נמחקת.
 * הרכיב מוסתר כשהתור ריק, ואפשר יהיה להסיר אותו כשהתור יתרוקן בייצור.
 * @param {{onPublished?: () => void}} props נקרא אחרי שנפתחו PR-ים, כדי לרענן את רשימתם
 */
export default function LegacyBookInfoQueue({ onPublished }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [rowErrors, setRowErrors] = useState({})
  const [selected, setSelected] = useState({})

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch('/api/admin/book-info/pending', { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'שגיאה בטעינה')
        }
        if (!cancelled) setRows(data.rows || [])
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const selections = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, fields]) => Array.isArray(fields) && fields.length > 0)
        .map(([changeId, fields]) => ({ changeId, fields })),
    [selected]
  )

  const allSelected = rows.length > 0 && rows.every((row) => (selected[row.id] || []).length === row.changedFields.length)

  const toggleField = (changeId, field, enabled) => {
    setSelected((prev) => {
      const current = new Set(prev[changeId] || [])
      if (enabled) current.add(field)
      else current.delete(field)
      return { ...prev, [changeId]: Array.from(current) }
    })
  }

  const toggleRow = (row, enabled) => setSelected((prev) => ({ ...prev, [row.id]: enabled ? [...row.changedFields] : [] }))

  const toggleAll = () => setSelected(allSelected ? {} : Object.fromEntries(rows.map((row) => [row.id, [...row.changedFields]])))

  // מסיר מהתצוגה את השדות שטופלו, ואת ההצעה כולה כשלא נשארו בה שדות
  const dropFields = (changeId, fields) =>
    setRows((prev) =>
      prev
        .map((row) => {
          if (row.id !== changeId) return row
          const changedFields = row.changedFields.filter((field) => !fields.includes(field))
          return changedFields.length > 0 ? { ...row, changedFields } : null
        })
        .filter(Boolean)
    )

  const post = async (action, items) => {
    const response = await fetch('/api/admin/book-info/pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, selections: items })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בפעולה')
    return data
  }

  // כל הצעה נפתחת כ-PR בבקשה נפרדת: כך כשל באחת אינו עוצר את השאר, והבקשה לא חורגת מזמן התגובה
  const publishSelected = async () => {
    setRunning(true)
    setError('')
    let published = 0
    const errors = {}
    for (const [i, item] of selections.entries()) {
      setProgress({ done: i, total: selections.length })
      try {
        await post('publish', [item])
        dropFields(item.changeId, item.fields)
        published++
      } catch (publishError) {
        errors[item.changeId] = publishError.message
      }
    }
    setRowErrors(errors)
    setSelected({})
    setProgress(null)
    setRunning(false)
    if (published > 0) onPublished?.()
  }

  const deleteSelected = async () => {
    try {
      setRunning(true)
      setError('')
      await post('delete', selections)
      for (const item of selections) dropFields(item.changeId, item.fields)
      setSelected({})
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setRunning(false)
    }
  }

  if (loading || (rows.length === 0 && !error)) return null

  return (
    <section className="mt-8">
      <h3 className="text-lg font-bold text-on-surface">הצעות מהתור הישן ({rows.length})</h3>
      <p className="text-sm text-on-surface/60 mb-3">
        הצעות שנשלחו לפני שכל עריכה נפתחה כ-PR. אפשר להעביר אותן ל-PR (בשם מי שהציע) או למחוק. הצעה שכבר
        אין בה שינוי מול הקובץ בריפו תידחה, ואז יש למחוק אותה.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={toggleAll} disabled={running} className="px-4 py-2 rounded-lg bg-neutral-cool-600 text-white disabled:opacity-50">
          {allSelected ? 'בטל סימון מהכל' : 'סמן הכל'}
        </button>
        <button onClick={publishSelected} disabled={running || selections.length === 0} className="px-4 py-2 rounded-lg bg-success-600 text-white disabled:opacity-50">
          {progress ? `פותח בקשות... ${progress.done}/${progress.total}` : 'העבר מסומן ל-PR'}
        </button>
        <button onClick={deleteSelected} disabled={running || selections.length === 0} className="px-4 py-2 rounded-lg bg-danger-600 text-white disabled:opacity-50">
          מחק מסומן
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-danger-700 bg-danger-50 border border-danger-200 px-3 py-2 rounded">{error}</div>}

      <div className="space-y-5">
        {rows.map((row) => (
          <LegacyChangeCard
            key={row.id}
            row={row}
            selectedFields={selected[row.id] || []}
            error={rowErrors[row.id]}
            onToggleRow={(enabled) => toggleRow(row, enabled)}
            onToggleField={(field, enabled) => toggleField(row.id, field, enabled)}
          />
        ))}
      </div>
    </section>
  )
}

function LegacyChangeCard({ row, selectedFields, error, onToggleRow, onToggleField }) {
  const allChecked = row.changedFields.length > 0 && selectedFields.length === row.changedFields.length
  return (
    <div className="border border-surface-variant rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-3 bg-surface flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="font-bold">{row.approved?.bookName || 'ספר ללא שם'}</div>
        <div className="text-sm text-on-surface/60">
          הוצע על ידי {row.submittedBy} | {new Date(row.updatedAt).toLocaleString('he-IL')}
        </div>
      </div>

      {error && <div className="px-4 py-2 text-sm text-danger-700 bg-danger-50 border-b border-danger-200">{error}</div>}

      <div className="px-4 py-3 border-b border-surface-variant/70">
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={allChecked} onChange={(e) => onToggleRow(e.target.checked)} />
          בחר את כל השדות בשורה
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="bg-surface/60">
              <th className="text-right px-3 py-2">סימון</th>
              <th className="text-right px-3 py-2">שדה</th>
              <th className="text-right px-3 py-2">ישן</th>
              <th className="text-right px-3 py-2">חדש</th>
            </tr>
          </thead>
          <tbody>
            {row.changedFields.map((field) => (
              <tr key={field} className="border-t border-surface-variant/60">
                <td className="px-3 py-2">
                  <input type="checkbox" checked={selectedFields.includes(field)} onChange={(e) => onToggleField(field, e.target.checked)} />
                </td>
                <td className="px-3 py-2 font-medium">{BOOK_INFO_FIELD_LABELS[field] || field}</td>
                <td className="px-3 py-2">{formatBookInfoValue(row.approved?.[field])}</td>
                <td className="px-3 py-2 text-primary font-medium">{formatBookInfoValue(row.changes?.[field])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
