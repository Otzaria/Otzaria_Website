'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import { formatDateWithTime } from '@/lib/formatDate'
import ProofEditor from '../ProofEditor'

// סקירת הגשה במסך מלא: העמוד עם הפעולות של המתייג מוחלות, רשימת הפעולות
// (לשונית "שינויים"), ואישור / דחייה. "עריכה לפני אישור" פותחת את העורך
// — מה שיאושר הוא רשימת הפעולות אחרי התיקון.

const stripInternal = (ops) => ops.map(({ _g, ...o }) => (void _g, o))

export default function ReviewModal({ id, onClose, onDone }) {
  const { showAlert, showConfirm } = useDialog()
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/page-proof/submissions/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (!d.success) throw new Error(d.error || 'הטעינה נכשלה')
        setData(d)
      })
      .catch((e) => {
        showAlert('שגיאה', e.message)
        onClose()
      })
    return () => {
      alive = false
    }
  }, [id, showAlert, onClose])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !editing && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, onClose])

  const act = async (action, ops = null) => {
    if (action === 'reject') {
      const ok = await showConfirm('דחיית ההגשה', 'העמוד יחזור למאגר ויוצע למתייג אחר. להמשיך?')
      if (!ok) return
    }
    setBusy(true)
    try {
      const body = { action, note }
      if (ops) body.ops = stripInternal(ops)
      const res = await fetch(`/api/admin/page-proof/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'הפעולה נכשלה')
      onDone(id, d.status)
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  const sub = data?.submission
  const pending = sub?.status === 'submitted'
  const canReject = pending || (sub?.status === 'approved' && !sub?.exportedAt)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2" dir="rtl">
      <div className="mx-auto flex max-w-[1900px] flex-col gap-2 rounded-2xl bg-background p-3">
        {!data ? (
          <LoadingSpinner message="טוען הגשה..." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="flex items-center gap-2 text-lg font-bold text-on-surface">
                <span className="material-symbols-outlined text-primary">rate_review</span>
                {data.page.title} · עמוד {data.page.page}
              </h3>
              <span className="text-sm text-on-surface/70">
                {sub.userName} · {formatDateWithTime(sub.createdAt)} · {sub.ops.length} פעולות
                {data.page.required > 1 && ' · עמוד כפול'}
              </span>
              {sub.note && <span className="rounded bg-warning-alt-100 px-2 py-0.5 text-sm">הערת המתייג: {sub.note}</span>}
              {data.siblings.length > 0 && (
                <span className="text-xs text-on-surface/60">
                  הגשות נוספות לעמוד: {data.siblings.map((s) => `${s.userName} (${s.status}, ${s.opCount})`).join(' · ')}
                </span>
              )}
              {sub.reviewedByName && (
                <span className="text-xs text-on-surface/60">
                  נבדק ע״י {sub.reviewedByName}{sub.reviewerEdited ? ' (עם תיקונים)' : ''}{sub.reviewNote ? ` — ${sub.reviewNote}` : ''}
                </span>
              )}
              <span className="flex-1" />
              <button onClick={onClose} className="rounded-md px-3 py-1 hover:bg-surface-variant" disabled={busy}>
                סגירה
              </button>
            </div>

            <ProofEditor
              page={data.page}
              initialOps={sub.ops}
              readOnly={!editing}
              persist={false}
              actions={({ ops }) => (
                <>
                  {pending && (
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
                      עריכה לפני אישור
                    </label>
                  )}
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="הערת בודק" className="w-44 rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm" />
                  {pending && (
                    <button
                      disabled={busy || !ops.length}
                      onClick={() => {
                        const changed = JSON.stringify(stripInternal(ops)) !== JSON.stringify(sub.ops)
                        act('approve', editing && changed ? ops : null)
                      }}
                      className="rounded-lg bg-success-600 px-4 py-1.5 font-bold text-white hover:bg-success-700 disabled:opacity-40"
                    >
                      אישור
                    </button>
                  )}
                  {canReject && (
                    <button disabled={busy} onClick={() => act('reject')} className="rounded-lg bg-danger-600 px-4 py-1.5 font-bold text-white hover:opacity-90 disabled:opacity-40">
                      דחייה
                    </button>
                  )}
                </>
              )}
            />
          </>
        )}
      </div>
    </div>
  )
}
