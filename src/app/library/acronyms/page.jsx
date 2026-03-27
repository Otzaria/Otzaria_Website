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
  const [editingAliasKey, setEditingAliasKey] = useState('')
  const [editingAliasValue, setEditingAliasValue] = useState('')
  const [editingPendingId, setEditingPendingId] = useState('')
  const [editingPendingCurrentValue, setEditingPendingCurrentValue] = useState('')
  const [editingPendingNextValue, setEditingPendingNextValue] = useState('')

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
        ...((row.pendingAliases || []).map((p) => p.currentAlias || p.nextAlias || ''))
      ]
      return values.some((value) => String(value || '').includes(term))
    })
  }, [rows, search])

  const requestChange = async (rowId, body) => {
    try {
      setSubmittingId(rowId)
      const response = await fetch('/api/library/book-acronyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookAcronymId: rowId, ...body })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בשליחת הבקשה')
      }

      setNewAliasById((prev) => ({ ...prev, [rowId]: body.actionType === 'add' ? '' : prev[rowId] || '' }))
      await loadData()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmittingId('')
    }
  }

  const submitAlias = async (rowId) => {
    const alias = (newAliasById[rowId] || '').trim()
    if (!alias) return
    await requestChange(rowId, { actionType: 'add', alias })
  }

  const requestDeleteAlias = async (rowId, alias) => {
    await requestChange(rowId, { actionType: 'delete', alias })
  }

  const startEditAlias = (rowId, alias) => {
    setEditingAliasKey(`${rowId}::${alias}`)
    setEditingAliasValue(alias)
  }

  const cancelEditAlias = () => {
    setEditingAliasKey('')
    setEditingAliasValue('')
  }

  const startEditPending = (pending) => {
    setEditingPendingId(pending.id)
    setEditingPendingCurrentValue(pending.currentAlias || '')
    setEditingPendingNextValue(pending.nextAlias || '')
  }

  const cancelEditPending = () => {
    setEditingPendingId('')
    setEditingPendingCurrentValue('')
    setEditingPendingNextValue('')
  }

  const saveEditAlias = async (rowId, originalAlias) => {
    const nextAlias = editingAliasValue.trim()
    if (!nextAlias) return
    await requestChange(rowId, { actionType: 'update', alias: originalAlias, nextAlias })
    cancelEditAlias()
  }

  const saveEditPending = async (rowId, pending) => {
    const body = {
      pendingId: pending.id,
      actionType: pending.actionType
    }

    if (pending.actionType === 'delete') {
      body.alias = editingPendingCurrentValue.trim()
    } else if (pending.actionType === 'update') {
      body.alias = editingPendingCurrentValue.trim()
      body.nextAlias = editingPendingNextValue.trim()
    } else {
      body.alias = editingPendingNextValue.trim()
    }

    await requestChange(rowId, body)
    cancelEditPending()
  }

  const formatPendingLabel = (pending) => {
    if (pending.actionType === 'delete') {
      return `מחיקה: ${pending.currentAlias}`
    }
    if (pending.actionType === 'update') {
      return `עריכה: ${pending.currentAlias} -> ${pending.nextAlias}`
    }
    return `הוספה: ${pending.nextAlias}`
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
                        <div key={alias} className="px-2 py-1 text-sm rounded-md bg-green-50 text-green-800 border border-green-200 flex items-center gap-1">
                          {editingAliasKey === `${row.id}::${alias}` ? (
                            <>
                              <input
                                type="text"
                                value={editingAliasValue}
                                onChange={(e) => setEditingAliasValue(e.target.value)}
                                className="border rounded px-2 py-0.5 text-sm bg-white text-black"
                              />
                              <button
                                type="button"
                                onClick={() => saveEditAlias(row.id, alias)}
                                disabled={submittingId === row.id}
                                className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white disabled:opacity-50"
                              >
                                שמור
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditAlias}
                                className="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700"
                              >
                                בטל
                              </button>
                            </>
                          ) : (
                            <>
                              <span>{alias}</span>
                              <button
                                type="button"
                                onClick={() => startEditAlias(row.id, alias)}
                                className="text-xs px-1 rounded bg-white border border-green-300"
                              >
                                ערוך
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDeleteAlias(row.id, alias)}
                                disabled={submittingId === row.id}
                                className="text-xs px-1 rounded bg-white border border-red-300 text-red-700 disabled:opacity-50"
                              >
                                מחק
                              </button>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {(row.pendingAliases || []).length > 0 && (
                    <>
                      <div className="mb-2 text-sm font-medium text-on-surface/80">ממתין לאישור:</div>
                      <div className="flex flex-wrap gap-2">
                        {row.pendingAliases.map((pending) => (
                          <div
                            key={pending.id}
                            className="px-2 py-1 text-sm rounded-md bg-orange-50 text-orange-800 border border-orange-200 flex items-center gap-1"
                          >
                            {editingPendingId === pending.id ? (
                              <>
                                {(pending.actionType === 'delete' || pending.actionType === 'update') && (
                                  <input
                                    type="text"
                                    value={editingPendingCurrentValue}
                                    onChange={(e) => setEditingPendingCurrentValue(e.target.value)}
                                    className="border rounded px-2 py-0.5 text-sm bg-white text-black"
                                    placeholder={pending.actionType === 'delete' ? 'כינוי למחיקה' : 'כינוי ישן'}
                                  />
                                )}
                                {(pending.actionType === 'add' || pending.actionType === 'update') && (
                                  <input
                                    type="text"
                                    value={editingPendingNextValue}
                                    onChange={(e) => setEditingPendingNextValue(e.target.value)}
                                    className="border rounded px-2 py-0.5 text-sm bg-white text-black"
                                    placeholder={pending.actionType === 'add' ? 'כינוי חדש' : 'כינוי חדש'}
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => saveEditPending(row.id, pending)}
                                  disabled={submittingId === row.id}
                                  className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white disabled:opacity-50"
                                >
                                  שמור
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditPending}
                                  className="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700"
                                >
                                  בטל
                                </button>
                              </>
                            ) : (
                              <>
                                <span>{formatPendingLabel(pending)}</span>
                                <button
                                  type="button"
                                  onClick={() => startEditPending(pending)}
                                  className="text-xs px-1 rounded bg-white border border-orange-300"
                                >
                                  ערוך
                                </button>
                              </>
                            )}
                          </div>
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
