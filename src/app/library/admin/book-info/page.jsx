'use client'

import { useEffect, useMemo, useState } from 'react'

const FIELD_LABELS = {
  bookName: 'שם הספר',
  authorName: 'שם המחבר',
  generationName: 'דור המחבר',
  subGenerationName: 'דור משנה',
  startYear: 'תחילת התקופה',
  endYear: 'סיום התקופה'
}

export default function AdminBookInfoPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningAction, setRunningAction] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState({})

  const loadRows = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/admin/book-info/pending', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בטעינה')
      }
      setRows(data.rows || [])
      setSelected({})
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [])

  const toggleField = (changeId, field, enabled) => {
    setSelected((prev) => {
      const current = new Set(prev[changeId] || [])
      if (enabled) current.add(field)
      else current.delete(field)
      return { ...prev, [changeId]: Array.from(current) }
    })
  }

  const toggleRow = (row, enabled) => {
    setSelected((prev) => ({
      ...prev,
      [row.id]: enabled ? [...row.changedFields] : []
    }))
  }

  const selections = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, fields]) => Array.isArray(fields) && fields.length > 0)
        .map(([changeId, fields]) => ({ changeId, fields })),
    [selected]
  )

  const allSelected =
    rows.length > 0 &&
    rows.every((row) => {
      const selectedFields = selected[row.id] || []
      return row.changedFields.length > 0 && selectedFields.length === row.changedFields.length
    })

  const toggleSelectAllRows = () => {
    if (allSelected) {
      setSelected({})
      return
    }

    setSelected(
      Object.fromEntries(
        rows.map((row) => [row.id, [...row.changedFields]])
      )
    )
  }

  const runAction = async (action) => {
    if (selections.length === 0) {
      setError('לא נבחרו שדות')
      return
    }
    try {
      setRunningAction(true)
      setError('')
      const response = await fetch('/api/admin/book-info/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, selections })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בפעולה')
      }
      const selectionsById = new Map(selections.map((item) => [item.changeId, item.fields]))

      setRows((prev) =>
        prev
          .map((row) => {
            const selectedFields = selectionsById.get(row.id)
            if (!selectedFields || selectedFields.length === 0) {
              return row
            }

            const nextApproved = { ...(row.approved || {}) }
            const nextChanges = { ...(row.changes || {}) }

            for (const field of selectedFields) {
              if (action === 'approve' && Object.prototype.hasOwnProperty.call(nextChanges, field)) {
                nextApproved[field] = nextChanges[field]
              }
              delete nextChanges[field]
            }

            const nextChangedFields = row.changedFields.filter((field) => !selectedFields.includes(field))
            if (nextChangedFields.length === 0) {
              return null
            }

            return {
              ...row,
              approved: nextApproved,
              changes: nextChanges,
              changedFields: nextChangedFields
            }
          })
          .filter(Boolean)
      )
      setSelected({})
    } catch (actionError) {
      setError(actionError.message)
    } finally {
      setRunningAction(false)
    }
  }

  return (
    <div className="glass-strong p-6 rounded-xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">אישור מידע על ספרים</h2>
          <p className="text-on-surface/60">השווה בין ערך ישן לערך חדש ואשר או מחק לפי שדות.</p>
        </div>
        <a
          href="/api/admin/book-info/export-csv"
          className="inline-flex items-center gap-2 px-4 py-2 bg-success-alt-600 text-white rounded-lg hover:bg-success-alt-700"
          download
        >
          <span className="material-symbols-outlined">download</span>
          הורדת CSV עם כל המידע הקיים
        </a>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={toggleSelectAllRows}
          disabled={loading || rows.length === 0}
          className="px-4 py-2 rounded-lg bg-neutral-cool-600 text-white disabled:opacity-50"
        >
          {allSelected ? 'בטל סימון מהכל' : 'סמן הכל'}
        </button>
        <button
          onClick={() => runAction('approve')}
          disabled={runningAction || selections.length === 0}
          className="px-4 py-2 rounded-lg bg-success-600 text-white disabled:opacity-50"
        >
          אשר מסומן
        </button>
        <button
          onClick={() => runAction('delete')}
          disabled={runningAction || selections.length === 0}
          className="px-4 py-2 rounded-lg bg-danger-600 text-white disabled:opacity-50"
        >
          מחק מסומן
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-danger-700 bg-danger-50 border border-danger-200 px-3 py-2 rounded">{error}</div>}

      {loading ? (
        <div className="text-center py-10">טוען...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-on-surface/60">אין שינויים שממתינים לאישור.</div>
      ) : (
        <div className="space-y-5">
          {rows.map((row) => {
            const selectedFields = selected[row.id] || []
            const allChecked = row.changedFields.length > 0 && selectedFields.length === row.changedFields.length
            return (
              <div key={row.id} className="border border-surface-variant rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-3 bg-surface flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="font-bold">{row.approved?.bookName || 'ספר ללא שם'}</div>
                  <div className="text-sm text-on-surface/60">
                    הוצע על ידי {row.submittedBy} | {new Date(row.updatedAt).toLocaleString('he-IL')}
                  </div>
                </div>

                <div className="px-4 py-3 border-b border-surface-variant/70">
                  <label className="inline-flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(e) => toggleRow(row, e.target.checked)}
                    />
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
                            <input
                              type="checkbox"
                              checked={selectedFields.includes(field)}
                              onChange={(e) => toggleField(row.id, field, e.target.checked)}
                            />
                          </td>
                          <td className="px-3 py-2 font-medium">{FIELD_LABELS[field] || field}</td>
                          <td className="px-3 py-2">{formatValue(row.approved?.[field])}</td>
                          <td className="px-3 py-2 text-primary font-medium">{formatValue(row.changes?.[field])}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  return String(value)
}

