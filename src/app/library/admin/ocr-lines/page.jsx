'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import OcrLineContextModal from '@/components/ocr/OcrLineContextModal'
import { isAdmin } from '@/lib/roles'

const TABS = [
  { id: 'submitted', label: 'ממתינות לאישור', icon: 'pending_actions' },
  { id: 'approved', label: 'מאושרות', icon: 'check_circle' },
  { id: 'available', label: 'זמינות לתמלול', icon: 'lock_open' },
]

const SCRIPT_LABELS = { square: 'מרובע', rashi: 'רש״י' }

export default function AdminOcrLinesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()

  const [tab, setTab] = useState('submitted')
  const [lines, setLines] = useState([])
  const [counts, setCounts] = useState({ available: 0, submitted: 0, approved: 0 })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [contextLine, setContextLine] = useState(null)

  const load = useCallback(async (statusFilter, skip = 0) => {
    try {
      if (skip === 0) setLoading(true)
      else setLoadingMore(true)
      const res = await fetch(`/api/admin/ocr-lines?status=${statusFilter}&skip=${skip}`)
      const data = await res.json()
      if (data.success) {
        setLines((prev) => (skip === 0 ? data.lines : [...prev, ...data.lines]))
        setCounts(data.counts)
        setTotal(data.total)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push('/library/auth/login?callbackUrl=/library/admin/ocr-lines')
      return
    }
    if (!isAdmin(session?.user?.role)) {
      router.push('/library/dashboard')
      return
    }
    load(tab)
  }, [status, session, router, tab, load])

  // פעולה על שורה: מסירים אותה מהרשימה המקומית ומעדכנים מונים — בלי טעינה מחדש
  const removeLocal = (id, fromStatus, toStatus) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
    setTotal((t) => Math.max(0, t - 1))
    setCounts((c) => {
      const next = { ...c, [fromStatus]: Math.max(0, c[fromStatus] - 1) }
      if (toStatus) next[toStatus] = (next[toStatus] || 0) + 1
      return next
    })
  }

  const updateLocal = (id, patch) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  // פעולות סוג כתב: קביעה ישירה, או קבלה/דחייה של הצעת המתמלל
  const handleScript = async (line, action, scriptType) => {
    try {
      const res = await fetch(`/api/admin/ocr-lines/${line.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scriptType }),
      })
      const data = await res.json()
      if (data.success) updateLocal(line.id, { scriptType: data.scriptType, suggestedScriptType: null })
      else showAlert('שגיאה', data.error || 'שגיאה בעדכון סוג הכתב')
    } catch {
      showAlert('שגיאה', 'תקלה בתקשורת')
    }
  }

  const handleApprove = async (line) => {
    try {
      const res = await fetch(`/api/admin/ocr-lines/${line.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const data = await res.json()
      if (data.success) removeLocal(line.id, 'submitted', 'approved')
      else showAlert('שגיאה', data.error || 'שגיאה באישור')
    } catch {
      showAlert('שגיאה', 'תקלה בתקשורת')
    }
  }

  const handleReturn = (line) => {
    showConfirm('החזרה לעריכה', 'הטקסט שהוקלד יימחק והשורה תחזור למאגר הזמינות. להמשיך?', async () => {
      try {
        const res = await fetch(`/api/admin/ocr-lines/${line.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'return' }),
        })
        const data = await res.json()
        if (data.success) removeLocal(line.id, line.status, 'available')
        else showAlert('שגיאה', data.error || 'שגיאה בהחזרה')
      } catch {
        showAlert('שגיאה', 'תקלה בתקשורת')
      }
    })
  }

  const handleDelete = (line) => {
    showConfirm('מחיקת שורה', 'למחוק את השורה מהמאגר לגמרי? פעולה זו אינה הפיכה.', async () => {
      try {
        const res = await fetch(`/api/admin/ocr-lines/${line.id}`, { method: 'DELETE' })
        const data = await res.json()
        if (data.success) removeLocal(line.id, line.status, null)
        else showAlert('שגיאה', data.error || 'שגיאה במחיקה')
      } catch {
        showAlert('שגיאה', 'תקלה בתקשורת')
      }
    })
  }

  const handleDownloadApproved = () => {
    const link = document.createElement('a')
    link.href = '/api/admin/ocr-lines/export'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">edit_note</span>
          תמלול שורות OCR
        </h2>
        <button
          onClick={handleDownloadApproved}
          disabled={counts.approved === 0}
          className="bg-success-600 hover:bg-success-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-40"
          title="הורדת השורות המאושרות כ-ZIP בפורמט האימון (manifest + חיתוכים)"
        >
          <span className="material-symbols-outlined text-sm">download_done</span>
          הורד מאושרות (ZIP)
        </button>
      </div>

      {/* טאבים לפי סטטוס */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
              tab === t.id ? 'bg-primary text-on-primary' : 'glass text-on-surface hover:bg-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{t.icon}</span>
            {t.label} ({counts[t.id]})
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner message="טוען שורות..." />
      ) : lines.length === 0 ? (
        <div className="text-center py-10 text-neutral-500 bg-white rounded-xl border border-neutral-200">
          אין שורות בסטטוס זה.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lines.map((line) => (
            <div
              key={line.id}
              className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-stretch"
            >
              {/* תמונת השורה (מימין) — אותה תצוגה כמו אצל המשתמש */}
              <div className="md:w-1/2 flex flex-col gap-2">
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2 flex items-center justify-center min-h-[56px]">
                  <img
                    src={`/api/ocr-lines/${line.id}/image`}
                    alt="שורה"
                    className="max-h-20 w-full object-contain"
                    draggable={false}
                  />
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
                  <button
                    onClick={() => setContextLine(line)}
                    className="text-info-600 hover:bg-info-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                    title="הצגת העמוד המלא סביב השורה"
                  >
                    <span className="material-symbols-outlined text-sm">pageview</span>
                    העמוד המלא
                  </button>

                  {/* בורר סוג כתב — לחיצה קובעת ישירות (ומבטלת הצעה פתוחה) */}
                  <span className="flex items-center gap-1">
                    <span>כתב:</span>
                    {['square', 'rashi'].map((s) => (
                      <button
                        key={s}
                        onClick={() => line.scriptType !== s && handleScript(line, 'set-script', s)}
                        title={line.scriptType === s ? 'סוג הכתב הנוכחי' : `החלף ל${SCRIPT_LABELS[s]}`}
                        className={`px-2 py-0.5 rounded-full text-xs font-bold transition-all border ${
                          line.scriptType === s
                            ? s === 'rashi'
                              ? 'bg-warning-alt-100 text-warning-alt-800 border-warning-alt-300'
                              : 'bg-info-100 text-info-800 border-info-300'
                            : 'bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        {SCRIPT_LABELS[s]}
                      </button>
                    ))}
                  </span>

                  {line.bookName && (
                    <span>
                      {line.bookName} · עמ׳ {line.pageNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* הטקסט + המתמלל + פעולות (משמאל) */}
              <div className="md:w-1/2 flex flex-col gap-2">
                {line.suggestedScriptType && (
                  <div className="bg-warning-alt-50 border-2 border-warning-alt-300 text-warning-alt-800 rounded-lg p-2 text-sm flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-1 font-bold">
                      <span className="material-symbols-outlined text-sm">swap_horiz</span>
                      המתמלל מציע לשנות את סוג הכתב מ{SCRIPT_LABELS[line.scriptType]} ל
                      {SCRIPT_LABELS[line.suggestedScriptType]}
                    </span>
                    <span className="flex gap-1">
                      <button
                        onClick={() => handleScript(line, 'accept-script')}
                        className="bg-success-600 hover:bg-success-700 text-white text-xs font-bold px-3 py-1 rounded-lg transition-colors"
                      >
                        קבל
                      </button>
                      <button
                        onClick={() => handleScript(line, 'reject-script')}
                        className="bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-xs font-bold px-3 py-1 rounded-lg transition-colors"
                      >
                        דחה
                      </button>
                    </span>
                  </div>
                )}
                {line.status === 'available' ? (
                  <div className="border border-dashed border-neutral-300 rounded-lg p-3 text-neutral-400 text-sm flex-1">
                    טרם תומללה
                  </div>
                ) : (
                  <div dir="rtl" className="border border-neutral-200 bg-neutral-50 rounded-lg p-3 text-lg text-neutral-800 flex-1">
                    {line.text}
                  </div>
                )}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm text-neutral-500 flex items-center gap-2">
                    {line.transcribedByName && (
                      <>
                        <span className="material-symbols-outlined text-sm">person</span>
                        <span className="font-medium text-neutral-700">{line.transcribedByName}</span>
                        {line.transcribedAt && (
                          <span className="text-xs">
                            {new Date(line.transcribedAt).toLocaleDateString('he-IL')}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {line.status === 'submitted' && (
                      <button
                        onClick={() => handleApprove(line)}
                        disabled={!!line.suggestedScriptType}
                        className="text-success-600 hover:bg-success-50 p-1.5 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={
                          line.suggestedScriptType
                            ? 'יש הצעת שינוי סוג כתב — קבלו או דחו אותה לפני האישור'
                            : 'אשר תמלול'
                        }
                      >
                        <span className="material-symbols-outlined">check_circle</span>
                      </button>
                    )}
                    {line.status !== 'available' && (
                      <button
                        onClick={() => handleReturn(line)}
                        className="text-warning-strong-600 hover:bg-warning-strong-50 p-1.5 rounded-lg transition-colors"
                        title="החזר לעריכה (מוחק את הטקסט ומחזיר למאגר)"
                      >
                        <span className="material-symbols-outlined">undo</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(line)}
                      className="text-danger-600 hover:bg-danger-50 p-1.5 rounded-lg transition-colors"
                      title="מחק את השורה לגמרי"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {lines.length < total && (
            <button
              onClick={() => load(tab, lines.length)}
              disabled={loadingMore}
              className="self-center glass text-on-surface hover:bg-surface-variant px-6 py-2 rounded-lg font-medium transition-all disabled:opacity-40"
            >
              {loadingMore ? 'טוען...' : `טען עוד (${total - lines.length} נוספות)`}
            </button>
          )}
        </div>
      )}

      {contextLine && <OcrLineContextModal line={contextLine} onClose={() => setContextLine(null)} />}
    </div>
  )
}
