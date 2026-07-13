'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  PagenumTaskCard,
  HeaderTaskCard,
  StreamsTaskCard,
  ZonesFullCard,
} from '@/components/ocr/layout/LayoutTaskCards'
import { isAdmin } from '@/lib/roles'
import {
  validateAnswer,
  confirmedAnswerFromPrefill,
  TASK_LABELS,
} from '@/lib/ocr/layoutValidation'

// ניהול תיוג מבנה-עמוד: ייבוא אצוות ZIP מפרויקט ה-OCR, סקירת הגשות
// המתנדבים (כולל עריכת תשובה לפני אישור — באותם כרטיסים של המתנדב),
// אישור/החזרה/מחיקה, וייצוא ההכרעות המאושרות. למנהל גלובלי בלבד.

const TABS = [
  { id: 'submitted', label: 'ממתינים לאישור', icon: 'pending_actions' },
  { id: 'approved', label: 'מאושרים', icon: 'check_circle' },
  { id: 'available', label: 'זמינים לתיוג', icon: 'lock_open' },
]

const KIND_OPTIONS = [
  { id: '', label: 'כל הסוגים' },
  { id: 'pagenum', label: TASK_LABELS.pagenum },
  { id: 'header', label: TASK_LABELS.header },
  { id: 'streams', label: TASK_LABELS.streams },
  { id: 'zones-full', label: TASK_LABELS['zones-full'] },
]

// תקציר תשובה של משימה לשורת הרשימה
function taskSummary(t) {
  const conf = t.confirmed ? ' ✓ (המכונה צדקה)' : ''
  if (!t.answer) return `${TASK_LABELS[t.kind]}: טרם נענתה`
  if (t.kind === 'pagenum') {
    return `${TASK_LABELS.pagenum}: ${t.answer.value === null ? 'אין מספר' : t.answer.value}${conf}`
  }
  if (t.kind === 'header') {
    return `${TASK_LABELS.header}: ${t.answer.box === null ? 'אין כותרת' : 'תיבה סומנה'}${conf}`
  }
  if (t.kind === 'streams') {
    return `${TASK_LABELS.streams}: ${(t.answer.bands || []).length} רצועות${conf}`
  }
  if (t.kind === 'zones-full') {
    const parts = []
    if (t.answer.pagenum) parts.push(t.answer.pagenum.value === null ? 'אין מספר' : t.answer.pagenum.value)
    if (t.answer.header) parts.push(t.answer.header.box === null ? 'אין כותרת' : 'כותרת')
    if (t.answer.streams) parts.push(`${(t.answer.streams.bands || []).length} רצועות`)
    return `${TASK_LABELS['zones-full']}: ${parts.join(' · ')}${conf}`
  }
  return TASK_LABELS[t.kind]
}

// המרת משימה שמורה ל-value של כרטיסי המשימות
function taskToValue(t) {
  if (t.confirmed) return { confirmed: true, answer: null }
  if (t.answer) return { confirmed: false, answer: t.answer }
  return null
}

// מודאל סקירה/עריכה: תצוגת התשובה על העמוד באותם כרטיסים של המתנדב.
// שינוי בכרטיס מסמן את המשימה כ"נערכה" ונשלח ב-set-answers בשמירה.
function ReviewModal({ page, onClose, onSaved, onApprove }) {
  const { showAlert } = useDialog()
  const [values, setValues] = useState(() => page.tasks.map(taskToValue))
  const [dirty, setDirty] = useState(() => page.tasks.map(() => false))
  const [saving, setSaving] = useState(false)

  const setValue = (i, v) => {
    setValues((prev) => prev.map((x, j) => (j === i ? v : x)))
    setDirty((prev) => prev.map((x, j) => (j === i ? true : x)))
  }

  const anyDirty = dirty.some(Boolean)
  const allValid = page.tasks.every((t, i) => {
    const v = values[i]
    if (!v) return !dirty[i] // משימה שלא נגעו בה נשארת כמו שהיא
    if (v.confirmed) return true
    return validateAnswer(t.kind, v.answer, t.prefill, page.imageWidth, page.imageHeight) === null
  })

  const save = async () => {
    if (!anyDirty || !allValid || saving) return
    setSaving(true)
    try {
      // רק משימות שנערכו נשלחות; "נכון" של מנהל ממומש מה-prefill בצד הלקוח
      const answers = page.tasks.map((t, i) => {
        if (!dirty[i] || !values[i]) return {}
        return {
          answer: values[i].confirmed
            ? confirmedAnswerFromPrefill(t.kind, t.prefill)
            : values[i].answer,
        }
      })
      const res = await fetch(`/api/admin/ocr-layout/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-answers', answers }),
      })
      const data = await res.json()
      if (data.success) {
        onSaved(page.id, data.tasks)
        setDirty(page.tasks.map(() => false))
      } else showAlert('שגיאה', data.error || 'שגיאה בשמירת התשובות')
    } catch {
      showAlert('שגיאה', 'תקלה בתקשורת')
    } finally {
      setSaving(false)
    }
  }

  const imageBase = `/api/ocr-layout/${page.id}/image`

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div
        dir="rtl"
        className="bg-background rounded-2xl w-full max-w-5xl my-6 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">rate_review</span>
            {page.edition} / {page.pageStem}
            <span className="text-sm font-normal text-on-surface/50">({page.batch})</span>
          </h3>
          <div className="flex items-center gap-2">
            {anyDirty && (
              <button
                onClick={save}
                disabled={!allValid || saving}
                className="bg-primary hover:opacity-90 text-on-primary font-bold px-4 py-2 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">{saving ? 'hourglass_top' : 'save'}</span>
                שמור תיקונים
              </button>
            )}
            {page.status === 'submitted' && onApprove && (
              <button
                onClick={() => onApprove(page)}
                disabled={anyDirty}
                title={anyDirty ? 'שמרו את התיקונים לפני האישור' : 'אשר את הכרעות העמוד'}
                className="bg-success-600 hover:bg-success-700 text-white font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                אשר
              </button>
            )}
            <button onClick={onClose} className="glass text-on-surface hover:bg-surface-variant p-2 rounded-lg transition-all">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {page.answeredByName && (
          <div className="text-sm text-on-surface/60 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">person</span>
            תויג בידי <span className="font-bold text-on-surface/80">{page.answeredByName}</span>
            {page.answeredAt && <span>· {new Date(page.answeredAt).toLocaleDateString('he-IL')}</span>}
          </div>
        )}

        {page.tasks.map((t, i) => (
          <div key={i} className="glass-strong rounded-xl p-4">
            {t.kind === 'pagenum' && (
              <PagenumTaskCard
                prefill={t.prefill}
                imgSrc={`${imageBase}?task=${i}`}
                value={values[i]}
                onChange={(v) => setValue(i, v)}
              />
            )}
            {t.kind === 'header' && (
              <HeaderTaskCard
                prefill={t.prefill}
                imageUrl={imageBase}
                imageWidth={page.imageWidth}
                imageHeight={page.imageHeight}
                value={values[i]}
                onChange={(v) => setValue(i, v)}
              />
            )}
            {t.kind === 'streams' && (
              <StreamsTaskCard
                prefill={t.prefill}
                imageUrl={imageBase}
                imageWidth={page.imageWidth}
                imageHeight={page.imageHeight}
                value={values[i]}
                onChange={(v) => setValue(i, v)}
              />
            )}
            {t.kind === 'zones-full' && (
              <ZonesFullCard
                prefill={t.prefill}
                imageUrl={imageBase}
                pagenumImgSrc={t.prefill.pagenum ? `${imageBase}?task=${i}&part=pagenum` : null}
                imageWidth={page.imageWidth}
                imageHeight={page.imageHeight}
                value={values[i]}
                onChange={(v) => setValue(i, v)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminOcrLayoutPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()

  const [tab, setTab] = useState('submitted')
  const [filters, setFilters] = useState({ batch: '', edition: '', kind: '' })
  const [pages, setPages] = useState([])
  const [counts, setCounts] = useState({ available: 0, submitted: 0, approved: 0 })
  const [facets, setFacets] = useState({ batches: [], editions: [] })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reviewPage, setReviewPage] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(async (statusFilter, f, skip = 0) => {
    try {
      if (skip === 0) setLoading(true)
      else setLoadingMore(true)
      const params = new URLSearchParams({ status: statusFilter, skip: String(skip) })
      if (f.batch) params.set('batch', f.batch)
      if (f.edition) params.set('edition', f.edition)
      if (f.kind) params.set('kind', f.kind)
      const res = await fetch(`/api/admin/ocr-layout?${params}`)
      const data = await res.json()
      if (data.success) {
        // ב"טען עוד" מסננים כפולים — עימוד skip עלול להחזיר עמוד שכבר מוצג
        setPages((prev) =>
          skip === 0
            ? data.pages
            : [...prev, ...data.pages.filter((p) => !prev.some((q) => q.id === p.id))]
        )
        setCounts(data.counts)
        setTotal(data.total)
        setFacets(data.facets)
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
      router.push('/library/auth/login?callbackUrl=/library/admin/ocr-layout')
      return
    }
    if (!isAdmin(session?.user?.role)) {
      router.push('/library/dashboard')
      return
    }
    load(tab, filters)
  }, [status, session, router, tab, filters, load])

  const removeLocal = (id, fromStatus, toStatus) => {
    setPages((prev) => prev.filter((p) => p.id !== id))
    setTotal((t) => Math.max(0, t - 1))
    setCounts((c) => {
      const next = { ...c, [fromStatus]: Math.max(0, c[fromStatus] - 1) }
      if (toStatus) next[toStatus] = (next[toStatus] || 0) + 1
      return next
    })
  }

  const handleApprove = async (page) => {
    try {
      const res = await fetch(`/api/admin/ocr-layout/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const data = await res.json()
      if (data.success) {
        removeLocal(page.id, 'submitted', 'approved')
        setReviewPage((r) => (r?.id === page.id ? null : r))
      } else showAlert('שגיאה', data.error || 'שגיאה באישור')
    } catch {
      showAlert('שגיאה', 'תקלה בתקשורת')
    }
  }

  const handleReturn = (page) => {
    showConfirm('החזרה לתיוג', 'ההכרעות שסומנו יימחקו והעמוד יחזור למאגר הזמינים. להמשיך?', async () => {
      try {
        const res = await fetch(`/api/admin/ocr-layout/${page.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'return' }),
        })
        const data = await res.json()
        if (data.success) removeLocal(page.id, page.status, 'available')
        else showAlert('שגיאה', data.error || 'שגיאה בהחזרה')
      } catch {
        showAlert('שגיאה', 'תקלה בתקשורת')
      }
    })
  }

  const handleDelete = (page) => {
    showConfirm('מחיקת עמוד', 'למחוק את העמוד מהמאגר לגמרי? פעולה זו אינה הפיכה.', async () => {
      try {
        const res = await fetch(`/api/admin/ocr-layout/${page.id}`, { method: 'DELETE' })
        const data = await res.json()
        if (data.success) removeLocal(page.id, page.status, null)
        else showAlert('שגיאה', data.error || 'שגיאה במחיקה')
      } catch {
        showAlert('שגיאה', 'תקלה בתקשורת')
      }
    })
  }

  const handleSavedAnswers = (id, tasks) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, tasks } : p)))
    setReviewPage((r) => (r?.id === id ? { ...r, tasks } : r))
  }

  const handleImport = async (file) => {
    if (!file) return
    setImporting(true)
    setImportSummary(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/ocr-layout/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) {
        setImportSummary(data.summary)
        load(tab, filters)
      } else showAlert('שגיאה בייבוא', data.error || 'שגיאה בייבוא האצווה')
    } catch {
      showAlert('שגיאה', 'תקלה בתקשורת')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleExport = () => {
    const link = document.createElement('a')
    link.href = '/api/admin/ocr-layout/export'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">space_dashboard</span>
          תיוג מבנה עמוד (OCR)
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => handleImport(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="bg-info-600 hover:bg-info-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-40"
            title="ייבוא אצוות ZIP שהפיק export_labeling_batch.py בפרויקט ה-OCR"
          >
            <span className="material-symbols-outlined text-sm">{importing ? 'hourglass_top' : 'upload_file'}</span>
            {importing ? 'מייבא...' : 'ייבוא אצווה (ZIP)'}
          </button>
          <button
            onClick={handleExport}
            disabled={counts.approved === 0}
            className="bg-success-600 hover:bg-success-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-40"
            title="הורדת ההכרעות המאושרות — <edition>.human.jsonl לכל מהדורה + contributors.tsv"
          >
            <span className="material-symbols-outlined text-sm">download_done</span>
            הורד מאושרים (ZIP)
          </button>
        </div>
      </div>

      {importSummary && (
        <div className="mb-6 bg-info-50 border border-info-200 text-info-900 rounded-xl p-4 text-sm flex flex-col gap-1">
          <div className="font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">inventory</span>
            סיכום ייבוא
          </div>
          <div>
            {importSummary.pages} עמודים נקלטו ({importSummary.created} חדשים, {importSummary.updated} עודכנו).
            {importSummary.skippedAnswered > 0 && ` ${importSummary.skippedAnswered} דולגו — כבר נענו.`}
          </div>
          <div>
            לפי סוג: {Object.entries(importSummary.byKind).filter(([, n]) => n > 0).map(([k, n]) => `${TASK_LABELS[k]} — ${n}`).join(' · ') || 'אין'}
          </div>
          {importSummary.errors.length > 0 && (
            <div className="text-danger-700">
              שגיאות ({importSummary.errors.length}): {importSummary.errors.slice(0, 5).join(' | ')}
            </div>
          )}
        </div>
      )}

      {/* טאבים לפי סטטוס + סינון */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
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
        <span className="flex-1" />
        <select
          dir="rtl"
          value={filters.batch}
          onChange={(e) => setFilters((f) => ({ ...f, batch: e.target.value }))}
          className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          <option value="">כל האצוות</option>
          {facets.batches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select
          dir="rtl"
          value={filters.edition}
          onChange={(e) => setFilters((f) => ({ ...f, edition: e.target.value }))}
          className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          <option value="">כל המהדורות</option>
          {facets.editions.map((ed) => (
            <option key={ed} value={ed}>{ed}</option>
          ))}
        </select>
        <select
          dir="rtl"
          value={filters.kind}
          onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}
          className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k.id} value={k.id}>{k.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner message="טוען עמודים..." />
      ) : pages.length === 0 ? (
        <div className="text-center py-10 text-neutral-500 bg-white rounded-xl border border-neutral-200">
          אין עמודים בסטטוס זה. {counts.available + counts.submitted + counts.approved === 0 && 'התחילו בייבוא אצווה.'}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {pages.map((page) => (
            <div
              key={page.id}
              className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-stretch"
            >
              {/* תמונה מוקטנת (מימין) */}
              <button
                onClick={() => setReviewPage(page)}
                className="md:w-40 shrink-0 bg-neutral-50 border border-neutral-200 rounded-lg p-1 flex items-center justify-center hover:ring-2 hover:ring-primary/40 transition-all"
                title="פתיחת סקירה מלאה של העמוד"
              >
                <img
                  src={`/api/ocr-layout/${page.id}/image`}
                  alt={`${page.edition}/${page.pageStem}`}
                  className="max-h-40 w-full object-contain"
                  loading="lazy"
                  draggable={false}
                />
              </button>

              {/* פרטים ופעולות */}
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-bold text-on-surface">{page.edition} / {page.pageStem}</span>
                  <span className="text-xs text-neutral-500 bg-neutral-100 rounded-full px-2 py-0.5">{page.batch}</span>
                  {page.tasks.map((t, i) => (
                    <span key={i} className="text-xs bg-info-50 text-info-800 border border-info-200 rounded-full px-2 py-0.5">
                      {TASK_LABELS[t.kind]}
                    </span>
                  ))}
                </div>

                {page.status !== 'available' ? (
                  <ul className="text-sm text-neutral-700 space-y-0.5">
                    {page.tasks.map((t, i) => (
                      <li key={i}>{taskSummary(t)}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="border border-dashed border-neutral-300 rounded-lg p-2 text-neutral-400 text-sm">
                    טרם תויג
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm text-neutral-500 flex items-center gap-2">
                    {page.answeredByName && (
                      <>
                        <span className="material-symbols-outlined text-sm">person</span>
                        <span className="font-medium text-neutral-700">{page.answeredByName}</span>
                        {page.answeredAt && (
                          <span className="text-xs">{new Date(page.answeredAt).toLocaleDateString('he-IL')}</span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setReviewPage(page)}
                      className="text-info-600 hover:bg-info-50 p-1.5 rounded-lg transition-colors"
                      title="סקירה ועריכה על גבי העמוד"
                    >
                      <span className="material-symbols-outlined">rate_review</span>
                    </button>
                    {page.status === 'submitted' && (
                      <button
                        onClick={() => handleApprove(page)}
                        className="text-success-600 hover:bg-success-50 p-1.5 rounded-lg transition-colors"
                        title="אשר את הכרעות העמוד"
                      >
                        <span className="material-symbols-outlined">check_circle</span>
                      </button>
                    )}
                    {page.status !== 'available' && (
                      <button
                        onClick={() => handleReturn(page)}
                        className="text-warning-strong-600 hover:bg-warning-strong-50 p-1.5 rounded-lg transition-colors"
                        title="החזר לתיוג (מוחק את ההכרעות ומחזיר למאגר)"
                      >
                        <span className="material-symbols-outlined">undo</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(page)}
                      className="text-danger-600 hover:bg-danger-50 p-1.5 rounded-lg transition-colors"
                      title="מחק את העמוד לגמרי"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {pages.length < total && (
            <button
              onClick={() => load(tab, filters, pages.length)}
              disabled={loadingMore}
              className="self-center glass text-on-surface hover:bg-surface-variant px-6 py-2 rounded-lg font-medium transition-all disabled:opacity-40"
            >
              {loadingMore ? 'טוען...' : `טען עוד (${total - pages.length} נוספים)`}
            </button>
          )}
        </div>
      )}

      {reviewPage && (
        <ReviewModal
          page={reviewPage}
          onClose={() => setReviewPage(null)}
          onSaved={handleSavedAnswers}
          onApprove={handleApprove}
        />
      )}
    </div>
  )
}
