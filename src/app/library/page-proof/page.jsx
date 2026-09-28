'use client'

import { useCallback, useEffect, useState } from 'react'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { hasBookLibraryAccess, hasOcrAccess } from '@/lib/roles'
import ProofEditor from '@/components/pageProof/ProofEditor'
import ProofRules from '@/components/pageProof/ProofRules'
import { clearDraft } from '@/components/pageProof/useProofEditor'

// דף המתנדב להגהת-עמודים: רצף של עד 5 עמודים עוקבים מספר אחד (החוזה של
// פרויקט ה-OCR). כל עמוד מוגש בנפרד וממתין לאישור מנהל.

const STATE_HE = { mine: 'לעבודה', submitted: 'הוגש', approved: 'אושר', unavailable: 'אצל אחר' }
const STATE_CLS = {
  mine: 'bg-surface-variant/70',
  submitted: 'bg-info-100 text-info-800',
  approved: 'bg-success-100 text-success-800',
  unavailable: 'opacity-40',
}

export default function PageProofVolunteer() {
  const { session, status } = useRequireAuth()
  const { showAlert, showConfirm } = useDialog()
  const [seq, setSeq] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(null) // {mode, page, submission}
  const [loadingPage, setLoadingPage] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const role = session?.user?.role
  const canWork = session?.user?.isVerified || hasBookLibraryAccess(role) || hasOcrAccess(role)

  const openPage = useCallback(
    async (id) => {
      setLoadingPage(true)
      setNote('')
      try {
        const res = await fetch(`/api/page-proof/pages/${id}`)
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'העמוד לא נטען')
        setCurrent(data)
      } catch (e) {
        showAlert('שגיאה', e.message)
      } finally {
        setLoadingPage(false)
      }
    },
    [showAlert]
  )

  const loadSequence = useCallback(
    async (skip = null) => {
      setLoading(true)
      setCurrent(null)
      try {
        const res = await fetch(`/api/page-proof${skip ? `?skip=${encodeURIComponent(skip)}` : ''}`)
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'הטעינה נכשלה')
        setSeq(data.sequence)
        setStats(data.stats)
        const first = data.sequence?.pages.find((p) => p.state === 'mine')
        if (first) openPage(first.id)
      } catch (e) {
        showAlert('שגיאה', e.message)
      } finally {
        setLoading(false)
      }
    },
    [openPage, showAlert]
  )

  useEffect(() => {
    if (status === 'authenticated' && canWork) loadSequence()
    else if (status === 'authenticated') setLoading(false)
  }, [status, canWork, loadSequence])

  const skipSequence = async () => {
    const ok = await showConfirm('דילוג על הרצף', 'העמודים שלא הוגשו יחזרו למאגר ותקבלו רצף אחר. טיוטות שלא הוגשו יישארו בדפדפן. להמשיך?')
    if (!ok) return
    await fetch('/api/page-proof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'release' }) })
    loadSequence(seq?.book ? `${seq.book.id}:${seq.seq}` : null)
  }

  const submit = async ({ ops, untouched }) => {
    const page = current.page
    let toSend = ops
    if (!ops.length) {
      const ok = await showConfirm(
        'אין שינויים בעמוד',
        `לא תיקנתם דבר. אם קראתם את כל העמוד והכול נכון — נסמן את ${untouched.length} השורות כ"נכונות כפי שהן" ונגיש. להמשיך?`
      )
      if (!ok) return
      toSend = [{ kind: 'line_ok', page: page.page, ids: untouched }]
    } else {
      const ok = await showConfirm('הגשת העמוד', `${ops.length} פעולות יוגשו לאישור מנהל. אחרי ההגשה אי אפשר לשנות אותן.`)
      if (!ok) return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/page-proof/pages/${page.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: toSend, note }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'ההגשה נכשלה')
      clearDraft(page.id)
      // עדכון מקומי של הרצף — בלי לטעון אותו מחדש
      const pages = seq.pages.map((p) => (p.id === page.id ? { ...p, state: 'submitted' } : p))
      setSeq({ ...seq, pages })
      setStats((s) => (s ? { ...s, mySubmitted: s.mySubmitted + 1 } : s))
      const next = pages.find((p) => p.state === 'mine')
      showAlert('הוגש', `העמוד הוגש (${data.opCount} פעולות). תודה!`)
      if (next) openPage(next.id)
      else setCurrent(null)
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setSaving(false)
    }
  }

  const remaining = seq?.pages.filter((p) => p.state === 'mine').length || 0

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="w-full flex-1 px-3 py-4 lg:px-6">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
                <span className="material-symbols-outlined text-3xl text-accent">fact_check</span>
                הגהת עמודים סרוקים
              </h1>
              <p className="mt-1 text-sm text-on-surface/60">
                מתקנים את מה שהמחשב קרא בספר סרוק — טקסט, זרמים, פסקאות וקישורים — כדי שהספר ייכנס לאוצריא מוגה ומובנה.
              </p>
            </div>
            {stats && (
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-info-100 px-3 py-1 font-bold text-info-800">
                  {stats.done.toLocaleString('he-IL')} עמודים הושלמו · {stats.open.toLocaleString('he-IL')} פתוחים
                </span>
                {stats.mySubmitted + stats.myApproved > 0 && (
                  <span className="rounded-full bg-success-100 px-3 py-1 font-bold text-success-800">
                    שלכם: {stats.myApproved} אושרו · {stats.mySubmitted} ממתינים
                  </span>
                )}
              </div>
            )}
          </div>

          <ProofRules defaultOpen={!stats || stats.mySubmitted + stats.myApproved === 0} />

          {status === 'authenticated' && !canWork && (
            <div className="flex items-center gap-2 rounded-xl border border-warning-alt-200 bg-warning-alt-50 p-4 text-warning-alt-800">
              <span className="material-symbols-outlined">info</span>
              רק משתמשים עם כתובת אימייל מאומתת יכולים להגיה עמודים.
            </div>
          )}

          {loading ? (
            <LoadingSpinner message="מחפש עמודים..." />
          ) : canWork && !seq ? (
            <div className="glass-strong flex flex-col items-center gap-4 rounded-xl p-10 text-center">
              <p className="font-medium text-on-surface/70">אין כרגע עמודים פתוחים להגהה — תודה רבה על העזרה!</p>
              <button onClick={() => loadSequence()} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-on-primary hover:opacity-90">
                <span className="material-symbols-outlined">autorenew</span>
                בדוק שוב
              </button>
            </div>
          ) : seq ? (
            <>
              {/* הרצף */}
              <div className="glass-strong flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm">
                <span className="font-bold">{seq.book?.title}</span>
                <span className="text-on-surface/50">· רצף {seq.seq + 1}</span>
                <span className="mx-1 h-5 w-px bg-surface-variant" />
                {seq.pages.map((p) => (
                  <button
                    key={p.id}
                    disabled={p.state === 'unavailable' || loadingPage}
                    onClick={() => openPage(p.id)}
                    className={`rounded-md px-3 py-1 ${STATE_CLS[p.state]} ${current?.page?.id === p.id ? 'ring-2 ring-primary' : ''}`}
                    title={`${p.lines} שורות`}
                  >
                    עמוד {p.page} · {STATE_HE[p.state]}
                  </button>
                ))}
                <span className="flex-1" />
                <button onClick={skipSequence} className="flex items-center gap-1 rounded-md px-3 py-1 hover:bg-surface-variant" title="החזרת הרצף למאגר וקבלת רצף אחר">
                  <span className="material-symbols-outlined text-base">skip_next</span>
                  רצף אחר
                </button>
              </div>

              {loadingPage ? (
                <LoadingSpinner message="טוען עמוד..." />
              ) : current ? (
                <ProofEditor
                  key={current.page.id}
                  page={current.page}
                  readOnly={current.mode !== 'edit'}
                  initialOps={current.mode === 'edit' ? null : current.submission?.ops || []}
                  actions={({ ops, untouched }) =>
                    current.mode === 'edit' ? (
                      <>
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={1000}
                          placeholder="הערה למנהל (לא חובה)"
                          className="w-56 rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => submit({ ops, untouched })}
                          disabled={saving}
                          className="flex items-center gap-1 rounded-lg bg-success-600 px-4 py-1.5 font-bold text-white hover:bg-success-700 disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-base">{saving ? 'hourglass_top' : 'send'}</span>
                          הגשת העמוד
                        </button>
                      </>
                    ) : (
                      <span className="rounded bg-info-100 px-2 py-1 text-xs text-info-800">
                        {current.submission?.status === 'approved' ? 'ההגשה שלכם אושרה' : 'ההגשה שלכם ממתינה לאישור'}
                      </span>
                    )
                  }
                />
              ) : (
                <div className="glass-strong flex flex-col items-center gap-4 rounded-xl p-8 text-center">
                  <p className="font-medium text-on-surface/70">
                    {remaining === 0 ? 'סיימתם את הרצף — תודה!' : 'בחרו עמוד מהרצף'}
                  </p>
                  {remaining === 0 && (
                    <button onClick={() => loadSequence()} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-on-primary hover:opacity-90">
                      <span className="material-symbols-outlined">arrow_back</span>
                      לרצף הבא
                    </button>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}
