'use client'

import { useEffect, useMemo, useState } from 'react'

export default function AdminBookAcronymsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningAction, setRunningAction] = useState(false)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })

  const loadRows = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/admin/book-acronyms/pending', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בטעינה')
      }
      setRows(data.rows || [])
      setSelectedIds([])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
  }, [])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const toggleRow = (id, enabled) => {
    setSelectedIds((prev) => {
      if (enabled) return Array.from(new Set([...prev, id]))
      return prev.filter((item) => item !== id)
    })
  }

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const getSortIcon = (col) => {
    if (sortConfig.key !== col) return '↕'
    return sortConfig.direction === 'asc' ? '↑' : '↓'
  }

  const sortedRows = [...rows].sort((a, b) => {
    if (!sortConfig.key) return 0
    let aVal = a[sortConfig.key] ?? ''
    let bVal = b[sortConfig.key] ?? ''
    if (sortConfig.key === 'updatedAt') {
      aVal = new Date(aVal).getTime() || 0
      bVal = new Date(bVal).getTime() || 0
    } else {
      aVal = String(aVal).toLowerCase()
      bVal = String(bVal).toLowerCase()
    }
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  const allSelected = rows.length > 0 && selectedIds.length === rows.length

  const toggleSelectAllRows = () => {
    if (allSelected) {
      setSelectedIds([])
      return
    }

    setSelectedIds(rows.map((row) => row.id))
  }

  const runAction = async (action) => {
    if (selectedIds.length === 0) {
      setError('לא נבחרו פריטים')
      return
    }

    try {
      setRunningAction(true)
      setError('')
      const response = await fetch('/api/admin/book-acronyms/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, suggestionIds: selectedIds })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בביצוע הפעולה')
      }
      setRows((prev) => prev.filter((row) => !selectedIds.includes(row.id)))
      setSelectedIds([])
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
          <h2 className="text-2xl font-bold text-on-surface">אישור כינויים וראשי תיבות</h2>
          <p className="text-on-surface/60">כאן מאשרים או מוחקים הצעות חדשות ממשתמשים.</p>
        </div>
        <a
          href="/api/book-acronyms/export-json"
          className="inline-flex items-center gap-2 px-4 py-2 bg-success-alt-600 text-white rounded-lg hover:bg-success-alt-700"
          download
        >
          <span className="material-symbols-outlined">download</span>
          הורדת JSON מלא
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
          disabled={runningAction || selectedIds.length === 0}
          className="px-4 py-2 rounded-lg bg-success-600 text-white disabled:opacity-50"
        >
          אשר מסומן
        </button>
        <button
          onClick={() => runAction('delete')}
          disabled={runningAction || selectedIds.length === 0}
          className="px-4 py-2 rounded-lg bg-danger-600 text-white disabled:opacity-50"
        >
          מחק מסומן
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-danger-700 bg-danger-50 border border-danger-200 px-3 py-2 rounded">{error}</div>}

      {loading ? (
        <div className="text-center py-10">טוען...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-on-surface/60">אין הצעות שממתינות לאישור.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm bg-white rounded-xl overflow-hidden">
            <thead className="bg-surface/70">
              <tr>
                <th className="text-right px-3 py-2">סימון</th>
                <th onClick={() => handleSort('externalId')} className="text-right px-3 py-2 cursor-pointer hover:bg-surface select-none">ID ספר {getSortIcon('externalId')}</th>
                <th onClick={() => handleSort('displayName')} className="text-right px-3 py-2 cursor-pointer hover:bg-surface select-none">שם ספר {getSortIcon('displayName')}</th>
                <th className="text-right px-3 py-2">פרטי שינוי</th>
                <th className="text-right px-3 py-2">כינויים קיימים</th>
                <th onClick={() => handleSort('actionType')} className="text-right px-3 py-2 cursor-pointer hover:bg-surface select-none">סוג פעולה {getSortIcon('actionType')}</th>
                <th onClick={() => handleSort('submittedBy')} className="text-right px-3 py-2 cursor-pointer hover:bg-surface select-none">משתמש {getSortIcon('submittedBy')}</th>
                <th onClick={() => handleSort('updatedAt')} className="text-right px-3 py-2 cursor-pointer hover:bg-surface select-none">תאריך {getSortIcon('updatedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} className="border-t border-surface-variant/60">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(row.id)}
                      onChange={(e) => toggleRow(row.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2">{row.externalId}</td>
                  <td className="px-3 py-2">{row.displayName || 'ללא שם תצוגה'}</td>
                  <td className="px-3 py-2 font-medium text-primary">{formatActionDetails(row)}</td>
                  <td className="px-3 py-2">{(row.approvedAliases || []).join(' | ') || '-'}</td>
                  <td className="px-3 py-2">{formatActionType(row.actionType)}</td>
                  <td className="px-3 py-2">{row.submittedBy}</td>
                  <td className="px-3 py-2">{new Date(row.updatedAt).toLocaleString('he-IL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatActionType(actionType) {
  if (actionType === 'delete') return 'מחיקה'
  if (actionType === 'update') return 'עריכה'
  return 'הוספה'
}

function formatActionDetails(row) {
  if (row.actionType === 'delete') {
    return <span className="line-through text-danger-600">{row.currentAlias || '-'}</span>
  }
  if (row.actionType === 'update') {
    return (
      <span>
        <span className="text-on-surface/60">{row.currentAlias || '-'}</span>
        <span className="mx-1 text-on-surface/40">{'>>'}</span>
        <span>{row.nextAlias || '-'}</span>
      </span>
    )
  }
  return (
    <span>
      <span className="text-on-surface/70">{row.displayName || 'ללא שם תצוגה'}</span>
      <span className="font-semibold mr-1">{row.nextAlias || '-'}</span>
    </span>
  )
}
