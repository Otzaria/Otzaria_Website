'use client'

import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { BOOK_INFO_EXTENSION_EDITABLE_FIELDS, BOOK_INFO_LIMITS } from '@/lib/book-info-constants'
import { bookInfoFormUpdates, normalizeExtensionField, splitTopics } from '@/lib/book-info-utils'

const MAX_TOPIC_SUGGESTIONS = 200

export default function LibraryInfoPage() {
  const [sourceRevision, setSourceRevision] = useState(0)
  const [extendedFieldsEnabled, setExtendedFieldsEnabled] = useState(false)
  const [page, setPage] = useState(0)
  const [unresolvedEdits, setUnresolvedEdits] = useState([])
  const [rows, setRows] = useState([])
  const [generationOptions, setGenerationOptions] = useState([])
  const [subGenerationOptionsByGeneration, setSubGenerationOptionsByGeneration] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editRow, setEditRow] = useState(null)
  const [formData, setFormData] = useState(null)
  const [lastPr, setLastPr] = useState(null)

  const loadData = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true)
      setError('')
      const response = await fetch('/api/library/book-info', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בטעינת המידע')
      }
      setRows(data.rows || [])
      setUnresolvedEdits(data.unresolvedEdits || [])
      setSourceRevision(data.identityRevision || 0)
      setExtendedFieldsEnabled(data.extendedFieldsEnabled === true)
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
    const refresh = () => { if (!document.hidden) loadData(true) }
    const interval = setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(interval); window.removeEventListener('focus', refresh) }
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
            row.effective?.subGenerationName,
            row.effective?.topics
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

  const knownTopics = useMemo(() => {
    const topics = new Set()
    for (const row of rows) for (const topic of splitTopics(row.effective?.topics)) topics.add(topic)
    return [...topics].sort((a, b) => a.localeCompare(b, 'he'))
  }, [rows])

  // ההצעות משלימות את הנושא האחרון ברשימה, ולכן כל הצעה כוללת את הנושאים שכבר נכתבו לפניו
  const topicSuggestions = useMemo(() => {
    if (!formData) return []
    const typed = formData.topics || ''
    const prefix = typed.includes(';') ? typed.slice(0, typed.lastIndexOf(';') + 1) + ' ' : ''
    const chosen = new Set(splitTopics(prefix))
    return knownTopics.filter((topic) => !chosen.has(topic)).slice(0, MAX_TOPIC_SUGGESTIONS).map((topic) => prefix + topic)
  }, [formData, knownTopics])

  const openEdit = (row) => {
    setEditRow({ ...row, identityRevision: sourceRevision, bookRowCount: rows.filter((other) => other.effective?.bookName === row.effective?.bookName).length })
    setFormData({
      bookName: row.effective?.bookName || '',
      authorName: row.effective?.authorName || '',
      generationName: row.effective?.generationName || '',
      subGenerationName: row.effective?.subGenerationName || '',
      startYear: row.effective?.startYear ?? '',
      endYear: row.effective?.endYear ?? '',
      topics: (row.effective?.topics || '').split(';').join('; '),
      pubDate: row.effective?.pubDate || '',
      pubPlace: row.effective?.pubPlace || '',
      description: row.effective?.description || ''
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
    const extensionError = BOOK_INFO_EXTENSION_EDITABLE_FIELDS.map((field) => normalizeExtensionField(field, formData[field]).error).find(Boolean)
    if (extensionError) {
      setError(extensionError)
      return
    }

    try {
      setSaving(true)
      setError('')
      const updates = bookInfoFormUpdates(formData, editRow.approved, editRow.effective)
      const response = await fetch('/api/library/book-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book: editRow.approved?.bookName,
          author: editRow.approved?.authorName || '',
          identityRevision: editRow.identityRevision,
          baseRow: editRow.approved,
          updates
        })
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'שגיאה בשמירה')
      }
      setLastPr({ url: data.prUrl, number: data.prNumber })
      const bookLevel = Object.fromEntries(BOOK_INFO_EXTENSION_EDITABLE_FIELDS.filter((field) => field in updates).map((field) => [field, normalizeFormValue(field, formData[field])]))
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== editRow.id) {
            return row.effective?.bookName === editRow.effective?.bookName ? { ...row, effective: { ...row.effective, ...bookLevel } } : row
          }

          const normalizedEffective = {
            ...row.effective,
            ...Object.fromEntries(Object.entries(updates).map(([field, value]) => [field, normalizeFormValue(field, value)])),
            ...bookLevel
          }

          return {
            ...row,
            effective: normalizedEffective,
            pending: {
              id: data.id,
              prNumber: data.prNumber,
              prUrl: data.prUrl,
              changedFields: Object.keys(updates)
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

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / 100))
  const visiblePage = Math.min(page, pageCount - 1)
  const pageRows = filteredRows.slice(visiblePage * 100, (visiblePage + 1) * 100)

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-on-surface">מידע על ספרים</h1>
              <p className="text-on-surface/70 mt-1">המידע בדף זה משמש את אוצריא לסידור הספרים בתוכנה לפי סדר הדורות.</p>
              <p className="text-on-surface/70 mt-1">תרמו לפרוייקט בהוספת מידע חסר על ספרים ומחברים. כל שינוי נפתח כבקשה (PR) בריפו הספרייה ב-GitHub, ונכנס לאוצריא אחרי שהיא נבדקת וממוזגת.</p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="חיפוש לפי ספר/מחבר"
              className="w-full md:w-80 border rounded-lg px-4 py-2 bg-white"
            />
          </div>

          {lastPr && (
            <div className="mb-4 rounded-xl border border-success-200 bg-success-50 text-success-800 p-4 flex items-center justify-between gap-2">
              <span>תודה! השינוי נשלח לבדיקה.</span>
              <a href={lastPr.url} target="_blank" rel="noreferrer" className="underline flex items-center gap-1">
                בקשה #{lastPr.number}
                <span className="material-symbols-outlined text-base">open_in_new</span>
              </a>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3 text-danger-700">
              {error}
            </div>
          )}

          {unresolvedEdits.length > 0 && (
            <div className="mb-4 border border-danger-200 bg-danger-50 rounded-lg p-3">
              <p>בקשות לספרים שהוסרו או שזהותם דורשת בדיקה נשמרו:</p>
              <ul>{unresolvedEdits.map((pending) => <li key={pending.id}>{pending.book}: {pending.lastError || 'נדרשת בדיקת מנהל'} <PendingLink pending={{ ...pending, status: 'conflict' }} /></li>)}</ul>
            </div>
          )}
          {loading ? (
            <LoadingSpinner message="טוען נתוני ספרים..." />
          ) : (
            <div className="overflow-x-auto lg:overflow-visible rounded-xl border border-surface-variant bg-white">
              <table className="w-full min-w-[1400px]">
                <thead className="bg-surface">
                  <tr className="text-right text-sm text-on-surface/70">
                    <th className="sticky top-16 z-20 bg-surface px-3 py-3 shadow-sm">שם הספר</th>
                    <th className="sticky top-16 z-20 bg-surface px-3 py-3 shadow-sm">מחבר</th>
                    <th className="sticky top-16 z-20 bg-surface px-3 py-3 shadow-sm">דור</th>
                    <th className="sticky top-16 z-20 bg-surface px-3 py-3 shadow-sm">דור משנה</th>
                    <th className="sticky top-16 z-20 bg-surface px-3 py-3 shadow-sm">שנים</th>
                    <th className="sticky top-16 z-20 bg-surface px-3 py-3 shadow-sm">נושאים</th>
                    <th className="sticky top-16 z-20 bg-surface px-3 py-3 shadow-sm">הדפסה</th>
                    <th className="sticky top-16 z-20 bg-surface px-3 py-3 shadow-sm">רקע</th>
                    <th className="sticky top-16 z-20 bg-surface px-3 py-3 shadow-sm">פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-t border-surface-variant/70">
                      <td className="px-3 py-3 font-medium">
                        {row.effective?.bookName || '-'}
                        {row.proofread && <ProofreadTag className="ms-2" />}
                      </td>
                      <td className="px-3 py-3">{row.effective?.authorName || '-'}</td>
                      <td className="px-3 py-3">{row.effective?.generationName || '-'}</td>
                      <td className="px-3 py-3">{row.effective?.subGenerationName || '-'}</td>
                      <td className="px-3 py-3">
                        {row.effective?.startYear ?? '-'} - {row.effective?.endYear ?? '-'}
                      </td>
                      <td className="px-3 py-3 max-w-48 truncate text-sm" title={splitTopics(row.effective?.topics).join(', ')}>
                        {splitTopics(row.effective?.topics).join(', ') || '-'}
                      </td>
                      <td className="px-3 py-3 max-w-40 truncate text-sm" title={[row.effective?.pubPlace, row.effective?.pubDate].filter(Boolean).join(', ')}>
                        {[row.effective?.pubPlace, row.effective?.pubDate].filter(Boolean).join(', ') || '-'}
                      </td>
                      <td className="px-3 py-3 text-sm">
                        {row.effective?.description ? (
                          <span className="text-on-surface/70 cursor-help" title={excerpt(row.effective.description)}>יש</span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-3">
                        {row.pending ? (
                          <PendingLink pending={row.pending} />
                        ) : (
                          <button
                            onClick={() => openEdit(row)}
                            className="px-3 py-1.5 rounded-md bg-primary text-on-primary text-sm"
                          >
                            עריכה
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && pageCount > 1 && <div className="flex items-center gap-4 mt-4">
            <button disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)} className="text-primary disabled:opacity-40">הקודם</button>
            <span>עמוד {visiblePage + 1} מתוך {pageCount} ({filteredRows.length} ספרים)</span>
            <button disabled={visiblePage + 1 >= pageCount} onClick={() => setPage(visiblePage + 1)} className="text-primary disabled:opacity-40">הבא</button>
          </div>}
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
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">עריכת מידע ספר</h2>
                {editRow.proofread && <ProofreadTag />}
              </div>

              {/* שם הספר הוא שם הקובץ בספרייה, שלפיו הדור מקושר לספר; לכן אינו נערך כאן */}
              <Field label="שם הספר">
                <input
                  type="text"
                  value={formData.bookName}
                  readOnly
                  className="w-full border rounded-lg px-3 py-2 bg-surface text-on-surface/70 cursor-not-allowed"
                />
                <p className="text-xs text-on-surface/60 mt-1">שם הספר זהה לשמו בספרייה ואינו ניתן לשינוי.</p>
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

              <Field label="תחילת תקופת המחבר">
                <input
                  type="number"
                  value={formData.startYear}
                  onChange={(e) => setFormData((prev) => ({ ...prev, startYear: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </Field>

              <Field label="סיום תקופת המחבר">
                <input
                  type="number"
                  value={formData.endYear}
                  onChange={(e) => setFormData((prev) => ({ ...prev, endYear: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </Field>

              <div className="border-t border-surface-variant pt-4 space-y-4">
                <div>
                  <h3 className="font-bold">פרטי הספר</h3>
                  <p className="text-xs text-on-surface/60 mt-1">
                    {editRow.bookRowCount > 1
                      ? `השדות האלה שייכים לספר ולא למחבר, ויתעדכנו בכל ${editRow.bookRowCount} השורות של הספר.`
                      : 'השדות האלה שייכים לספר ולא למחבר.'}
                  </p>
                </div>

                {!extendedFieldsEnabled && <p className="text-sm text-on-surface/70">עריכת פרטי הספר הנוספים תהיה זמינה בהמשך.</p>}
                <fieldset disabled={!extendedFieldsEnabled} className="space-y-4 disabled:opacity-60">
                <Field label="נושאים">
                  <input
                    type="text"
                    list="book-info-topics"
                    value={formData.topics}
                    onChange={(e) => setFormData((prev) => ({ ...prev, topics: e.target.value }))}
                    placeholder="לדוגמה: הלכה; שבת"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                  <datalist id="book-info-topics">
                    {topicSuggestions.map((option) => <option key={option} value={option} />)}
                  </datalist>
                  <p className="text-xs text-on-surface/60 mt-1">
                    מפרידים בין נושאים בנקודה-פסיק (;). עד {BOOK_INFO_LIMITS.topicCount} נושאים, ועד {BOOK_INFO_LIMITS.topicLength} תווים לכל נושא.
                  </p>
                </Field>

                <Field label="שנת הדפסה">
                  <input
                    type="text"
                    value={formData.pubDate}
                    maxLength={BOOK_INFO_LIMITS.pubDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, pubDate: e.target.value }))}
                    placeholder='לדוגמה: תרפ"ה או 1925'
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </Field>

                <Field label="מקום הדפסה">
                  <input
                    type="text"
                    value={formData.pubPlace}
                    maxLength={BOOK_INFO_LIMITS.pubPlace}
                    onChange={(e) => setFormData((prev) => ({ ...prev, pubPlace: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </Field>

                <Field label="רקע על הספר">
                  <textarea
                    rows={5}
                    value={formData.description}
                    maxLength={BOOK_INFO_LIMITS.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 resize-y"
                  />
                  <p className="text-xs text-on-surface/60 mt-1">
                    {formData.description.length} / {BOOK_INFO_LIMITS.description} תווים
                  </p>
                </Field>
                </fieldset>
              </div>

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
                  {saving ? 'שולח...' : 'שלח לבדיקה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// לספר עם בקשה פתוחה אי אפשר לפתוח בקשה נוספת (השרת דוחה), ולכן במקום כפתור העריכה מוצג קישור אליה
function PendingLink({ pending }) {
  const label = pending.status === 'conflict' ? 'נדרשת בדיקה של הבקשה' : pending.prNumber ? `ממתין לבדיקה (#${pending.prNumber})` : 'ממתין לבדיקה'
  if (!pending.prUrl) return <span className="text-sm text-on-surface/60">{label}</span>
  return (
    <a
      href={pending.prUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm text-primary underline whitespace-nowrap"
      title={pending.lastError || 'יש כבר בקשה פתוחה לספר זה'}
    >
      {label}
      <span className="material-symbols-outlined text-base">open_in_new</span>
    </a>
  )
}

// מחושב בשרת מהגהות ועריכות שנעשו באתר, ולכן מוצג בלבד ואינו נערך
function ProofreadTag({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-success-200 bg-success-50 px-2 py-0.5 text-xs font-normal text-success-800 whitespace-nowrap ${className}`}
      title="הספר עבר הגהה או עריכה באוצריא. הסימון מחושב אוטומטית."
    >
      עבר הגהה באוצריא
    </span>
  )
}

function normalizeFormValue(field, value) {
  if (field === 'startYear' || field === 'endYear') return value === '' ? null : Number(value)
  if (BOOK_INFO_EXTENSION_EDITABLE_FIELDS.includes(field)) return normalizeExtensionField(field, value).value
  return value || null
}

function excerpt(text, max = 300) {
  return text.length > max ? `${text.slice(0, max)}…` : text
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



