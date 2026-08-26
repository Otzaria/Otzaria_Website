'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import { hasBooksAccess } from '@/lib/roles'

export default function LibraryAcronymsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [newAliasById, setNewAliasById] = useState({})
  const [submittingId, setSubmittingId] = useState('')
  const [editingAliasKey, setEditingAliasKey] = useState('')
  const [editingAliasValue, setEditingAliasValue] = useState('')
  const [editingPendingId, setEditingPendingId] = useState('')
  const [editingPendingCurrentValue, setEditingPendingCurrentValue] = useState('')
  const [editingPendingNextValue, setEditingPendingNextValue] = useState('')
  const { showAlert } = useDialog()

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push(`/auth/login?callbackUrl=${encodeURIComponent(pathname)}`)
      return
    }
    if (!hasBooksAccess(session?.user?.role)) {
      router.push('/library/unauthorized')
    }
  }, [status, session, router, pathname])

  const stripGershayim = (value) => String(value || '').trim().replace(/["'׳״]/g, '')

  // האם ההבדל היחיד בין הכינוי לבין שם הספר הוא הוספה/הסרה של גרשיים?
  const differsOnlyByGershayim = (candidate, reference) => {
    const stripped = stripGershayim(candidate)
    if (!stripped) return false
    return String(candidate || '').trim() !== String(reference || '').trim() && stripped === stripGershayim(reference)
  }

  const GERSHAYIM_ONLY_ERROR =
    'אין להוסיף כינוי שכל ההבדל בו הוא הוספת או הסרת גרשיים (") — זה כבר מטופל בצד התוכנה. יש להוסיף רק כינויים או ראשי תיבות בעלי ערך, כגון: רבי עקיבא אייגר ← רעק"א'

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/library/book-acronyms', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בטעינת הכינויים')
      }
      setRows(data.rows || [])
    } catch (loadError) {
      showAlert('שגיאה', loadError.message)
    } finally {
      setLoading(false)
    }
  }, [showAlert])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    const term = search.trim()
    if (!term) return rows

    return rows.filter((row) => {
      const values = [
        row.externalId,
        row.displayName,
        ...(row.aliases || []),
        ...((row.pendingAliases || []).flatMap((p) => [p.currentAlias || '', p.nextAlias || '']))
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
      setRows((prev) => {
        const row = prev.find((item) => item.id === rowId)
        if (!row) return prev

        const nextPendingAliases = [...(row.pendingAliases || [])]
        const actionType = body.actionType
        const pendingId = data.pendingId || body.pendingId || ''
        const pendingIndex = body.pendingId
          ? nextPendingAliases.findIndex((item) => item.id === body.pendingId)
          : -1

        const nextPending = {
          id: pendingId,
          actionType,
          currentAlias:
            actionType === 'delete' || actionType === 'update'
              ? (body.alias || '').trim()
              : null,
          nextAlias:
            actionType === 'add'
              ? (body.alias || '').trim()
              : actionType === 'update'
                ? (body.nextAlias || '').trim()
                : null,
          updatedAt: new Date().toISOString()
        }

        if (pendingIndex >= 0) {
          nextPendingAliases[pendingIndex] = nextPending
        } else if (!data.alreadyPending) {
          nextPendingAliases.unshift(nextPending)
        }

        const nextRows = prev.filter((item) => item.id !== rowId)
        nextRows.push({
          ...row,
          pendingAliases: nextPendingAliases
        })
        return nextRows
      })
    } catch (submitError) {
      showAlert('שגיאה', submitError.message)
    } finally {
      setSubmittingId('')
    }
  }

  const submitAlias = async (rowId) => {
    const alias = (newAliasById[rowId] || '').trim()
    if (!alias) return
    const row = rows.find((item) => item.id === rowId)
    if (row && differsOnlyByGershayim(alias, row.displayName)) {
      showAlert('לא ניתן להוסיף', GERSHAYIM_ONLY_ERROR)
      return
    }
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
    const row = rows.find((item) => item.id === rowId)
    if (row && differsOnlyByGershayim(nextAlias, row.displayName)) {
      showAlert('לא ניתן לעדכן', GERSHAYIM_ONLY_ERROR)
      return
    }
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

    // הצעות add/update מוסיפות כינוי חדש — נחסום שינוי גרשיים בלבד מול שם הספר גם כאן
    if (pending.actionType !== 'delete') {
      const candidate = editingPendingNextValue.trim()
      const row = rows.find((item) => item.id === rowId)
      if (row && differsOnlyByGershayim(candidate, row.displayName)) {
        showAlert(pending.actionType === 'add' ? 'לא ניתן להוסיף' : 'לא ניתן לעדכן', GERSHAYIM_ONLY_ERROR)
        return
      }
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
              <p className="text-on-surface/70 mt-1">הכינויים בדף זה משמשים לשיפור האיתור בתוכנת אוצריא.</p>
              <p className="text-on-surface/70 mt-1">תרמו לפרויקט בעדכון כינויים אפשריים לספרים. כל עריכה תישלח לאישור מנהל.</p>
            </div>
            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש לפי מזהה, שם או כינוי"
                className="w-full md:w-80 border rounded-lg px-4 py-2 bg-white"
              />
            </div>
          </div>


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
                        <div key={alias} className="px-2 py-1 text-sm rounded-md bg-success-50 text-success-800 border border-success-200 flex items-center gap-1">
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
                                className="text-xs px-2 py-0.5 rounded bg-info-600 text-white disabled:opacity-50"
                              >
                                שמור
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditAlias}
                                className="text-xs px-2 py-0.5 rounded border border-neutral-300 bg-white text-neutral-700"
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
                                className="text-xs px-1 rounded bg-white border border-success-300"
                              >
                                ערוך
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDeleteAlias(row.id, alias)}
                                disabled={submittingId === row.id}
                                className="text-xs px-1 rounded bg-white border border-danger-300 text-danger-700 disabled:opacity-50"
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
                            className="px-2 py-1 text-sm rounded-md bg-warning-strong-50 text-warning-strong-800 border border-warning-strong-200 flex items-center gap-1"
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
                                    placeholder="כינוי חדש"
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => saveEditPending(row.id, pending)}
                                  disabled={submittingId === row.id}
                                  className="text-xs px-2 py-0.5 rounded bg-info-600 text-white disabled:opacity-50"
                                >
                                  שמור
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditPending}
                                  className="text-xs px-2 py-0.5 rounded border border-neutral-300 bg-white text-neutral-700"
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
                                  className="text-xs px-1 rounded bg-white border border-warning-strong-300"
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












