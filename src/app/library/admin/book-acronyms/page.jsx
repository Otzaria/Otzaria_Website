'use client'

import { useEffect, useMemo, useState } from 'react'

export default function AdminBookAcronymsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningAction, setRunningAction] = useState(false)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

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
      await loadRows()
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
          href="/api/admin/book-acronyms/export-json"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          download
        >
          <span className="material-symbols-outlined">download</span>
          הורדת JSON מלא
        </a>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => runAction('approve')}
          disabled={runningAction || selectedIds.length === 0}
          className="px-4 py-2 rounded-lg bg-green-600 text-white disabled:opacity-50"
        >
          אשר מסומן
        </button>
        <button
          onClick={() => runAction('delete')}
          disabled={runningAction || selectedIds.length === 0}
          className="px-4 py-2 rounded-lg bg-red-600 text-white disabled:opacity-50"
        >
          מחק מסומן
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">{error}</div>}

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
                <th className="text-right px-3 py-2">ID ספר</th>
                <th className="text-right px-3 py-2">שם ספר</th>
                <th className="text-right px-3 py-2">כינויים קיימים</th>
                <th className="text-right px-3 py-2">כינוי מוצע</th>
                <th className="text-right px-3 py-2">משתמש</th>
                <th className="text-right px-3 py-2">תאריך</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
                  <td className="px-3 py-2">{(row.approvedAliases || []).join(' | ') || '-'}</td>
                  <td className="px-3 py-2 font-medium text-primary">{row.alias}</td>
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
