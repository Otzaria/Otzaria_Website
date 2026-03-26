'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function LibraryAcronymsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [newAliasById, setNewAliasById] = useState({})
  const [submittingId, setSubmittingId] = useState('')

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/library/book-acronyms', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בטעינת הכינויים')
      }
      setRows(data.rows || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim()
    if (!term) return rows

    return rows.filter((row) => {
      const values = [
        row.externalId,
        row.displayName,
        ...(row.aliases || []),
        ...((row.pendingAliases || []).map((p) => p.alias))
      ]
      return values.some((value) => String(value || '').includes(term))
    })
  }, [rows, search])

  const submitAlias = async (rowId) => {
    const alias = (newAliasById[rowId] || '').trim()
    if (!alias) return

    try {
      setSubmittingId(rowId)
      const response = await fetch('/api/library/book-acronyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookAcronymId: rowId, alias })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בשליחת הכינוי')
      }

      setNewAliasById((prev) => ({ ...prev, [rowId]: '' }))
      await loadData()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmittingId('')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-on-surface">כינויים וראשי תיבות לספרים</h1>
              <p className="text-on-surface/70 mt-1">אפשר לעיין בכינויים קיימים ולהציע כינוי חדש לאישור מנהל.</p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי מזהה, שם או כינוי"
              className="w-full md:w-80 border rounded-lg px-4 py-2 bg-white"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <LoadingSpinner message="טוען כינויים..." />
          ) : (
            <div className="space-y-4">
              {filteredRows.map((row) => (
                <div key={row.id} className="rounded-xl border border-surface-variant bg-white p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                    <div>
                      <div className="text-lg font-bold text-on-surface">{row.displayName || 'ללא שם תצוגה'}</div>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <input
                        type="text"
                        value={newAliasById[row.id] || ''}
                        onChange={(e) =>
                          setNewAliasById((prev) => ({
                            ...prev,
                            [row.id]: e.target.value
                          }))
                        }
                        placeholder="הוסף כינוי / ר״ת"
                        className="flex-1 md:w-72 border rounded-lg px-3 py-2"
                      />
                      <button
                        onClick={() => submitAlias(row.id)}
                        disabled={submittingId === row.id}
                        className="px-4 py-2 rounded-lg bg-primary text-on-primary disabled:opacity-50"
                      >
                        הוסף
                      </button>
                    </div>
                  </div>

                  <div className="mb-2 text-sm font-medium text-on-surface/80">כינויים מאושרים:</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(row.aliases || []).length === 0 ? (
                      <span className="text-sm text-on-surface/50">אין כינויים מאושרים</span>
                    ) : (
                      row.aliases.map((alias) => (
                        <span key={alias} className="px-2 py-1 text-sm rounded-md bg-green-50 text-green-800 border border-green-200">
                          {alias}
                        </span>
                      ))
                    )}
                  </div>

                  {(row.pendingAliases || []).length > 0 && (
                    <>
                      <div className="mb-2 text-sm font-medium text-on-surface/80">ממתין לאישור:</div>
                      <div className="flex flex-wrap gap-2">
                        {row.pendingAliases.map((pending) => (
                          <span
                            key={pending.id}
                            className="px-2 py-1 text-sm rounded-md bg-orange-50 text-orange-800 border border-orange-200"
                          >
                            {pending.alias}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
