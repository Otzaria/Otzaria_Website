'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { hasBookLibraryAccess, hasOcrAccess } from '@/lib/roles'
import ProofEditor from '@/components/pageProof/ProofEditor'
import ProofHelp from '@/components/pageProof/ProofHelp'
import SubmitDialog from '@/components/pageProof/SubmitDialog'
import { untouchedLineIds } from '@/lib/pageProof/view'
import { cleanupPageDrafts, pageDraftKey, removePageDrafts } from '@/lib/pageProof/drafts'
import { planSubmission, recheckLineIds, submitSummary } from '@/lib/pageProof/submitPlan'

// דף המתנדב להגהת-עמודים: רצף של עד 5 עמודים עוקבים מספר אחד (החוזה של
// פרויקט ה-OCR). כל עמוד מוגש בנפרד וממתין לאישור מנהל.
//
// ?page=<id> — פתיחה מרשת-העמודים (/library/page-proof/books): הרצף של העמוד
// הזה, והעמוד עצמו נפתח (לא העמוד הראשון שלכם ברצף). עמוד שמתנדב אחר מחזיק —
// השרת מחזיר רצף רגיל, והדף מסביר. "רצף אחר" משחרר רק את הרצף שעל המסך.
//
// החוזה מול ProofEditor:
//   draftKey — מפתח-הטיוטה בדפדפן לפי העמוד *והגרסה שלו* (lib/pageProof/
//     drafts.js). העורך שומר וקורא את הטיוטה רק במפתח הזה. בפתיחת עמוד
//     נמחקות הטיוטות של גרסאות אחרות שלו (עמוד שחזר מזיהוי-מחדש) והמפתח
//     הישן בלי גרסה (טיוטה ישנה תקפה עוברת קודם למפתח החדש).
//   actions({ops, view, untouched, approval}) — כפתור ההגשה בסרגל העורך;
//     approval = {approved, total}: פסקאות-התוכן שאושרו בכל העמוד.
// ההחלטה מה נשלח בכל בחירה של חלון ההגשה — lib/pageProof/submitPlan.js.

const STATE_HE = { mine: 'לעבודה', submitted: 'הוגש', approved: 'אושר', unavailable: 'אצל אחר' }
const STATE_CLS = {
  mine: 'bg-surface-variant/70',
  submitted: 'bg-info-100 text-info-800',
  approved: 'bg-success-100 text-success-800',
  unavailable: 'opacity-40',
}

// localStorage עלול להיות חסום (מצב פרטי/מדיניות-דפדפן) — אז פשוט בלי טיוטות
function withStorage(fn) {
  try {
    return fn(window.localStorage)
  } catch {
    return null
  }
}

// שגיאת-רשת או תשובה שאינה JSON — הודעה בעברית במקום הודעת-הדפדפן
const failMessage = (e, fallback) => (e?.name === 'TypeError' || e?.name === 'SyntaxError' ? fallback : e?.message || fallback)

const BASE_PATH = '/library/page-proof'
const GRID_PATH = '/library/page-proof/books'
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i

// "בחירת עמודים מספר" — מעבר לרשת-העמודים (באותו סגנון של "מה עושים כאן?")
function GridLink({ className = '' }) {
  return (
    <Link href={GRID_PATH} className={`flex items-center gap-1 rounded-full px-3 py-1 text-on-surface/80 transition-colors hover:bg-surface-variant ${className}`}>
      <span aria-hidden="true" className="material-symbols-outlined text-base">grid_view</span>
      בחירת עמודים מספר
    </Link>
  )
}

// useSearchParams דורש גבול-Suspense בדף (אחרת בניית Next נכשלת)
export default function PageProofVolunteerPage() {
  return (
    <Suspense fallback={<LoadingSpinner message="טוען..." />}>
      <PageProofVolunteer />
    </Suspense>
  )
}

function PageProofVolunteer() {
  const { session, status } = useRequireAuth()
  const { showAlert, showConfirm } = useDialog()
  const router = useRouter()
  const searchParams = useSearchParams()
  const wanted = searchParams?.get('page') || null
  // העמוד שביקשו בכתובת — נצרך פעם אחת, בטעינה הראשונה
  const focusRef = useRef(wanted && OBJECT_ID_RE.test(wanted) ? wanted : null)
  const [seq, setSeq] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState(null) // {mode, page, submission, draftKey}
  const [loadingPage, setLoadingPage] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  // חלון ההגשה פתוח: מה שהעורך העביר ברגע הלחיצה
  const [submitCtx, setSubmitCtx] = useState(null) // {ops, untouched, approval}
  const [submitError, setSubmitError] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)

  const role = session?.user?.role
  const canWork = session?.user?.isVerified || hasBookLibraryAccess(role) || hasOcrAccess(role)
  const editing = current?.mode === 'edit'

  const openPage = useCallback(
    async (id) => {
      setLoadingPage(true)
      setNote('')
      setSubmitCtx(null)
      setSubmitError(null)
      try {
        const res = await fetch(`/api/page-proof/pages/${id}`)
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'העמוד לא נטען')
        const draftKey = pageDraftKey(data.page)
        // עריכה: ניקוי טיוטות של גרסאות אחרות (לפני שהעורך קורא את שלו).
        // עמוד שכבר הגשתם: הטיוטות שלו מיותרות.
        if (data.mode === 'edit') withStorage((s) => cleanupPageDrafts(s, data.page, draftKey))
        else if (data.submission) withStorage((s) => removePageDrafts(s, data.page.id))
        setCurrent({ ...data, draftKey })
      } catch (e) {
        showAlert('שגיאה', failMessage(e, 'העמוד לא נטען — בדקו את החיבור ונסו שוב'))
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
      const focus = focusRef.current
      focusRef.current = null
      try {
        const qs = new URLSearchParams()
        if (skip) qs.set('skip', skip)
        if (focus) qs.set('page', focus)
        const q = qs.toString()
        const res = await fetch(`/api/page-proof${q ? `?${q}` : ''}`)
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'הטעינה נכשלה')
        setSeq(data.sequence)
        setStats(data.stats)
        const pages = data.sequence?.pages || []
        const asked = focus ? pages.find((p) => p.id === focus && p.state !== 'unavailable') : null
        const first = asked || pages.find((p) => p.state === 'mine')
        if (focus && !asked) {
          showAlert('העמוד אינו זמין', 'העמוד שבחרתם אינו זמין לכם כרגע — אולי מתנדב אחר עובד עליו. נפתח במקומו הרצף שלכם.')
        }
        if (first) openPage(first.id)
      } catch (e) {
        showAlert('שגיאה', failMessage(e, 'הטעינה נכשלה — בדקו את החיבור ונסו שוב'))
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

  // הכתובת בלי ?page= — כדי שרענון אחרי מעבר לרצף אחר לא יחזיר לעמוד הקודם
  const clearPageParam = useCallback(() => {
    if (searchParams?.get('page')) router.replace(BASE_PATH, { scroll: false })
  }, [router, searchParams])

  const skipSequence = async () => {
    const ok = await showConfirm(
      'דילוג על הרצף',
      'העמודים של הרצף הזה שלא הוגשו יחזרו למאגר, ותקבלו רצף אחר. עמודים שתפסתם ברשת-העמודים בספרים אחרים נשארים שלכם. טיוטות שלא הוגשו יישארו בדפדפן. להמשיך?'
    )
    if (!ok) return
    const body = { action: 'release', ...(seq?.book ? { book: seq.book.id, seq: seq.seq } : {}) }
    await fetch('/api/page-proof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    clearPageParam()
    loadSequence(seq?.book ? `${seq.book.id}:${seq.seq}` : null)
  }

  // "הגשת העמוד" בסרגל העורך ← חלון ההגשה
  const openSubmit = ({ ops, view, untouched, approval } = {}) => {
    setSubmitError(null)
    setSubmitCtx({
      ops: ops || [],
      untouched: Array.isArray(untouched) ? untouched : view ? untouchedLineIds(view) : [],
      approval: approval ?? null,
    })
  }
  const closeSubmit = useCallback(() => {
    setSubmitCtx(null)
    setSubmitError(null)
  }, [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])

  const summary = useMemo(
    () => (submitCtx && current ? submitSummary({ baseDoc: current.page.doc, ...submitCtx }) : null),
    [submitCtx, current]
  )
  const recheckCount = useMemo(() => (current ? recheckLineIds(current.page.doc).length : 0), [current])

  const submit = async (choice, { readAll = false } = {}) => {
    const page = current.page
    const plan = planSubmission({ baseDoc: page.doc, ...submitCtx, choice, readAll })
    if (!plan.ok) {
      setSubmitError(plan.error)
      return
    }
    setSaving(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/page-proof/pages/${page.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // revision — הגרסה שנפתחה בעורך: אם העמוד הוחלף בינתיים (חזר מזיהוי-מחדש)
        // השרת דוחה ב-409 במקום לבדוק את הפעולות מול שורות אחרות
        body: JSON.stringify({ ops: plan.ops, note, ...(Number.isInteger(page.revision) ? { revision: page.revision } : {}) }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'ההגשה נכשלה')
      withStorage((s) => removePageDrafts(s, page.id))
      setSubmitCtx(null)
      // עדכון מקומי של הרצף — בלי לטעון אותו מחדש
      const pages = seq.pages.map((p) => (p.id === page.id ? { ...p, state: 'submitted' } : p))
      setSeq({ ...seq, pages })
      setStats((s) => (s ? { ...s, mySubmitted: s.mySubmitted + 1 } : s))
      const next = pages.find((p) => p.state === 'mine')
      showAlert('הוגש', `העמוד הוגש (${data.opCount} פעולות). תודה!`)
      if (next) openPage(next.id)
      else setCurrent(null)
    } catch (e) {
      setSubmitError(failMessage(e, 'ההגשה נכשלה — בדקו את החיבור ונסו שוב. העבודה שמורה בדפדפן.'))
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
                <span aria-hidden="true" className="material-symbols-outlined text-3xl text-accent">fact_check</span>
                הגהת עמודים סרוקים
              </h1>
              <p className="mt-1 text-sm text-on-surface/60">
                מתקנים את מה שהמחשב קרא בספר סרוק — טקסט, זרמים, פסקאות וקישורים — כדי שהספר ייכנס לאוצריא מוגה ומובנה.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {stats && (
                <span className="rounded-full bg-info-100 px-3 py-1 font-bold text-info-800">
                  {stats.done.toLocaleString('he-IL')} עמודים הושלמו · {stats.open.toLocaleString('he-IL')} פתוחים
                </span>
              )}
              {stats && stats.mySubmitted + stats.myApproved > 0 && (
                <span className="rounded-full bg-success-100 px-3 py-1 font-bold text-success-800">
                  שלכם: {stats.myApproved} אושרו · {stats.mySubmitted} ממתינים
                </span>
              )}
              <GridLink />
              <button onClick={() => setHelpOpen(true)} className="flex items-center gap-1 rounded-full px-3 py-1 text-on-surface/80 transition-colors hover:bg-surface-variant">
                <span aria-hidden="true" className="material-symbols-outlined text-base">help</span>
                מה עושים כאן?
              </button>
            </div>
          </div>

          {status === 'authenticated' && !canWork && (
            <div className="flex items-center gap-2 rounded-xl border border-warning-alt-200 bg-warning-alt-50 p-4 text-warning-alt-800">
              <span aria-hidden="true" className="material-symbols-outlined">info</span>
              רק משתמשים עם כתובת אימייל מאומתת יכולים להגיה עמודים.
            </div>
          )}

          {loading ? (
            <LoadingSpinner message="מחפש עמודים..." />
          ) : canWork && !seq ? (
            <div className="glass-strong flex flex-col items-center gap-4 rounded-xl p-10 text-center">
              <p className="font-medium text-on-surface/70">אין כרגע עמודים פתוחים להגהה — תודה רבה על העזרה!</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button onClick={() => loadSequence()} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-on-primary hover:opacity-90">
                  <span aria-hidden="true" className="material-symbols-outlined">autorenew</span>
                  בדוק שוב
                </button>
                <GridLink className="py-3" />
              </div>
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
                    title={`${p.lines} שורות${p.revision > 1 ? ' · חזר מזיהוי-מחדש (מעבר שני)' : ''}`}
                  >
                    עמוד {p.page} · {STATE_HE[p.state]}
                    {p.revision > 1 && <span className="mr-1 rounded bg-warning-100 px-1 text-xs text-warning-800">מעבר שני</span>}
                  </button>
                ))}
                <span className="flex-1" />
                <button onClick={skipSequence} className="flex items-center gap-1 rounded-md px-3 py-1 hover:bg-surface-variant" title="החזרת הרצף למאגר וקבלת רצף אחר">
                  <span aria-hidden="true" className="material-symbols-outlined text-base">skip_next</span>
                  רצף אחר
                </button>
              </div>

              {/* מעבר שני: העמוד חזר מזיהוי-מחדש אחרי תיקון חיתוך */}
              {editing && recheckCount > 0 && !loadingPage && (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
                  <span aria-hidden="true" className="material-symbols-outlined">cached</span>
                  <p>
                    <b>מעבר שני לעמוד הזה.</b> אחרי תיקון חיתוך השורות העמוד נחתך ונקרא מחדש:{' '}
                    {recheckCount === 1 ? 'שורה אחת זוהתה מחדש ומסומנת' : `${recheckCount.toLocaleString('he-IL')} שורות זוהו מחדש ומסומנות`} בצהוב —
                    בדקו אותן היטב מול הסריקה.
                  </p>
                </div>
              )}

              {loadingPage ? (
                <LoadingSpinner message="טוען עמוד..." />
              ) : current ? (
                <ProofEditor
                  key={current.draftKey}
                  page={current.page}
                  draftKey={current.draftKey}
                  readOnly={!editing}
                  initialOps={editing ? null : current.submission?.ops || []}
                  actions={(args) =>
                    editing ? (
                      <button
                        onClick={() => openSubmit(args)}
                        disabled={saving}
                        className="flex items-center gap-1 rounded-lg bg-success-600 px-4 py-1.5 font-bold text-white hover:bg-success-700 disabled:opacity-40"
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-base">{saving ? 'hourglass_top' : 'send'}</span>
                        הגשת העמוד
                      </button>
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
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        onClick={() => {
                          clearPageParam()
                          loadSequence()
                        }}
                        className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-on-primary hover:opacity-90"
                      >
                        <span aria-hidden="true" className="material-symbols-outlined">arrow_back</span>
                        לרצף הבא
                      </button>
                      <GridLink className="py-3" />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>

      <ProofHelp open={helpOpen} onClose={closeHelp} autoOpen={editing} />

      {submitCtx && current && (
        <SubmitDialog
          pageNo={current.page.page}
          summary={summary}
          note={note}
          onNote={setNote}
          saving={saving}
          error={submitError}
          onCancel={closeSubmit}
          onSubmit={submit}
        />
      )}
    </div>
  )
}
