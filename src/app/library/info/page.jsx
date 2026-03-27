'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/Header'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function LibraryInfoPage() {
  const [rows, setRows] = useState([])
  const [generationOptions, setGenerationOptions] = useState([])
  const [subGenerationOptionsByGeneration, setSubGenerationOptionsByGeneration] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editRow, setEditRow] = useState(null)
  const [formData, setFormData] = useState(null)

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/library/book-info', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בטעינת המידע')
      }
      setRows(data.rows || [])
      setGenerationOptions(data.generationOptions || [])
      setSubGenerationOptionsByGeneration(data.subGenerationOptionsByGeneration || {})
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
    const baseRows = !term
      ? [...rows]
      : rows.filter((row) => {
          const values = [
            row.effective?.bookName,
            row.effective?.authorName,
            row.effective?.generationName,
            row.effective?.subGenerationName
          ]
          return values.some((value) => (value || '').includes(term))
        })

    return baseRows.sort((a, b) => {
      const missingA = countMissingFields(a.effective)
      const missingB = countMissingFields(b.effective)
      if (missingA !== missingB) {
        return missingB - missingA
      }
      return (a.effective?.bookName || '').localeCompare(b.effective?.bookName || '', 'he')
    })
  }, [rows, search])

  const openEdit = (row) => {
    setEditRow(row)
    setFormData({
      bookName: row.effective?.bookName || '',
      authorName: row.effective?.authorName || '',
      generationName: row.effective?.generationName || '',
      subGenerationName: row.effective?.subGenerationName || '',
      startYear: row.effective?.startYear ?? '',
      endYear: row.effective?.endYear ?? ''
    })
  }

  const closeEdit = () => {
    setEditRow(null)
    setFormData(null)
  }

  const handleGenerationChange = (nextGeneration) => {
    setFormData((prev) => {
      const allowedSub = subGenerationOptionsByGeneration[nextGeneration] || []
      if (nextGeneration === 'מחברי זמננו') {
        return {
          ...prev,
          generationName: nextGeneration,
          subGenerationName: 'מחברי זמננו'
        }
      }

      const keepCurrentSub = allowedSub.includes(prev.subGenerationName)
      return {
        ...prev,
        generationName: nextGeneration,
        subGenerationName: keepCurrentSub ? prev.subGenerationName : ''
      }
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!editRow || !formData) return

    try {
      setSaving(true)
      const response = await fetch('/api/library/book-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookInfoId: editRow.id,
          updates: formData
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בשמירה')
      }
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== editRow.id) return row

          const normalizedEffective = {
            ...row.effective,
            ...formData,
            startYear: formData.startYear === '' ? null : Number(formData.startYear),
            endYear: formData.endYear === '' ? null : Number(formData.endYear)
          }

          if (data.pendingCleared) {
            return {
              ...row,
              effective: row.approved,
              pending: null
            }
          }

          return {
            ...row,
            effective: normalizedEffective,
            pending: {
              id: data.pendingId || row.pending?.id || '',
              changedFields: data.changedFields || row.pending?.changedFields || [],
              submittedBy: row.pending?.submittedBy || 'משתמש',
              updatedAt: new Date().toISOString()
            }
          }
        })
      )
      closeEdit()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-on-surface">מידע על ספרים</h1>
              <p className="text-on-surface/70 mt-1">המידע בדף זה משמש את אוצריא לסידור הספרים בתוכנה לפי סדר הדורות.</p>
              <p className="text-on-surface/70 mt-1">תרמו לפרוייקט בהוספת מידע חסר על ספרים ומחברים. כל שינוי נשמר כהצעה ומחכה לאישור מנהל.</p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי ספר/מחבר"
              className="w-full md:w-80 border rounded-lg px-4 py-2 bg-white"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <LoadingSpinner message="טוען נתוני ספרים..." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-surface-variant bg-white">
              <table className="w-full min-w-[1080px]">
                <thead className="bg-surface">
                  <tr className="text-right text-sm text-on-surface/70">
                    <th className="px-3 py-3">שם הספר</th>
                    <th className="px-3 py-3">מחבר</th>
                    <th className="px-3 py-3">דור</th>
                    <th className="px-3 py-3">דור משנה</th>
                    <th className="px-3 py-3">שנים</th>
                    <th className="px-3 py-3">פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-t border-surface-variant/70">
                      <td className="px-3 py-3 font-medium">{row.effective?.bookName || '-'}</td>
                      <td className="px-3 py-3">{row.effective?.authorName || '-'}</td>
                      <td className="px-3 py-3">{row.effective?.generationName || '-'}</td>
                      <td className="px-3 py-3">{row.effective?.subGenerationName || '-'}</td>
                      <td className="px-3 py-3">
                        {row.effective?.startYear ?? '-'} - {row.effective?.endYear ?? '-'}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => openEdit(row)}
                          className="px-3 py-1.5 rounded-md bg-primary text-on-primary text-sm"
                        >
                          עריכה
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {editRow && formData && (
        <div
          className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center"
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-xl shadow-xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <h2 className="text-xl font-bold">עריכת מידע ספר</h2>

              <Field label="שם הספר">
                <input
                  type="text"
                  value={formData.bookName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, bookName: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </Field>

              <Field label="שם המחבר">
                <input
                  type="text"
                  value={formData.authorName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, authorName: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </Field>

              <Field label="דור">
                <select
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.generationName}
                  onChange={(e) => handleGenerationChange(e.target.value)}
                >
                  <option value="">ללא</option>
                  {generationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="דור משנה">
                <select
                  className="w-full border rounded-lg px-3 py-2"
                  value={formData.subGenerationName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, subGenerationName: e.target.value }))}
                  disabled={!formData.generationName}
                >
                  <option value="">ללא</option>
                  {(subGenerationOptionsByGeneration[formData.generationName] || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="תחילת התקופה">
                <input
                  type="number"
                  value={formData.startYear}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startYear: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </Field>

              <Field label="סיום התקופה">
                <input
                  type="number"
                  value={formData.endYear}
                  onChange={(e) => setFormData((prev) => ({ ...prev, endYear: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </Field>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="px-4 py-2 rounded-lg border border-surface-variant"
                  disabled={saving}
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary"
                  disabled={saving}
                >
                  {saving ? 'שומר...' : 'שלח לאישור'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm text-on-surface/70 mb-1">{label}</label>
      {children}
    </div>
  )
}

function countMissingFields(effective) {
  const fields = [
    effective?.authorName,
    effective?.generationName,
    effective?.subGenerationName,
    effective?.startYear,
    effective?.endYear
  ]
  return fields.reduce((sum, value) => {
    if (value === null || value === undefined) return sum + 1
    if (typeof value === 'string' && value.trim() === '') return sum + 1
    return sum
  }, 0)
}
