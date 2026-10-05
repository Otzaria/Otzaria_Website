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
import MyPagesPanel from '@/components/pageProof/books/MyPagesPanel'
import DraftCarriedNotice from '@/components/pageProof/DraftCarriedNotice'
import DraftConflictNotice from '@/components/pageProof/DraftConflictNotice'
import StagedEditor from '@/components/pageProof/StagedEditor'
import { untouchedLineIds } from '@/lib/pageProof/view'
import { cleanupPageDrafts, pageDraftKey, removePageDrafts } from '@/lib/pageProof/drafts'
import { applyServerDraft, removeDraftMeta, resolveDraftConflict } from '@/lib/pageProof/draftRules'
import { cleanOps, planSubmission, recheckLineIds, submitSummary } from '@/lib/pageProof/submitPlan'
import { bookHref, editorHref } from '@/lib/pageProof/gridState'
import { isCutOp } from '@/lib/pageProof/recutRules'
import { RECUT_OFF_HELP, submittedWaiting } from '@/lib/pageProof/helpTexts'
import { formatSince, formatUntil } from '@/lib/pageProof/dates'
import { STAGE_TEXT } from '@/lib/pageProof/stages'

// דף המתנדב להגהת-עמודים: העורך, לעמודים שכבר בטיפולכם. כל עמוד מוגש בנפרד
// וממתין לאישור מנהל.
//
// הכניסה לדף אינה תופסת שום עמוד: היא טוענת (קריאה בלבד) את "העמודים שלי" —
// GET /api/page-proof/mine — ומציגה אותם (MyPagesPanel), עם מעבר לבחירת עמודים
// ברשת (/library/page-proof/books). אין חלוקה אוטומטית בשום מקום: עמודים נתפסים רק
// ברשת-העמודים של הספר, בבחירה של המתנדב (עמוד, או רצף עוקב).
//
// ?page=<id> — פתיחה מהרשת או מ"העמודים שלי": הרצף של העמוד הזה, והעמוד עצמו
// נפתח — אם הוא בטיפולכם או שהגשתם אותו. אחרת — הסבר למה (unavailable),
// וקישור לרשת של הספר.
//
// שני שלבים (docs/63 §3; StagedEditor): קודם "מבנה" (מסגרות ושורות), ואז "טקסט". שינוי-חיתוך בשלב "מבנה" נשלח
// לזיהוי-מחדש מעצמו (POST /api/page-proof/pages/[id]/recut-request — רק תיקוני-החיתוך); העמוד ממתין לתוכנת-הספר
// (ב"העמודים שלי" — recutPending) וחוזר אלינו בגרסה חדשה, לשלב "טקסט"; אז הטיוטה עוברת אליו (בשרת, וגם
// drafts.cleanupPageDrafts — carried), והדף מספר מה עבר ומה לא.
//
// החוזה מול ProofEditor:
//   draftKey — מפתח-הטיוטה בדפדפן לפי העמוד *והגרסה שלו* (lib/pageProof/
//     drafts.js). העורך שומר וקורא את הטיוטה רק במפתח הזה. בפתיחת עמוד
//     נמחקות הטיוטות של גרסאות אחרות שלו (עמוד שחזר מזיהוי-מחדש) והמפתח
//     הישן בלי גרסה (טיוטה ישנה תקפה עוברת קודם למפתח החדש).
//   הטיוטה בשרת (docs/63 §2): העמוד מגיע עם draft — החדשה מבין המקומית לזו שבשרת נכתבת למפתח לפני שהעורך נפתח
//     (draftRules.applyServerDraft), והעורך בעריכה (StagedEditor) שומר אותה באתר בכל שינוי. כך עמוד שעבר
//     ממתנדב אחר מגיע עם העבודה שנעשתה בו, ומתנדב ממשיך ממחשב אחר.
//   actions({ops, view, untouched, approval}) — כפתור ההגשה בסרגל העורך;
//     approval = {approved, total}: פסקאות-התוכן שאושרו בכל העמוד.
// ההחלטה מה נשלח בכל בחירה של חלון ההגשה — lib/pageProof/submitPlan.js.

const STATE_HE = { mine: 'לעבודה', submitted: 'הוגש', approved: 'אושר', recut: 'בזיהוי-מחדש', unavailable: 'אצל אחר' }
const STATE_CLS = {
  mine: 'bg-surface-variant/70',
  submitted: 'bg-info-100 text-info-800',
  approved: 'bg-success-100 text-success-800',
  recut: 'bg-feature-100 text-feature-800',
  unavailable: 'opacity-40',
}

// הריחוף על עמוד בפס-הרצף: כמה שורות, מעבר שני, ועד מתי הוא שמור / מאז מתי ממתין לבדיקה
function seqPageTitle(p, now) {
  const parts = [`${p.lines} שורות`]
  if (p.revision > 1) parts.push('חזר מזיהוי-מחדש (מעבר שני)')
  const until = p.state === 'mine' ? formatUntil(p.leasedUntil, now) : ''
  if (until) parts.push(`שמור לך עד ${until}`)
  if (p.state === 'submitted') parts.push(submittedWaiting(formatSince(p.submittedAt, now)))
  return parts.join(' · ')
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
  const { showAlert } = useDialog()
  const router = useRouter()
  const searchParams = useSearchParams()
  const wanted = searchParams?.get('page') || null
  // העמוד שביקשו בכתובת — נצרך פעם אחת, בטעינה הראשונה
  const focusRef = useRef(wanted && OBJECT_ID_RE.test(wanted) ? wanted : null)
  const [seq, setSeq] = useState(null)
  const [held, setHeld] = useState([]) // "העמודים שלי": הרצפים שבהם אתם מחזיקים עמודים
  const [recutPending, setRecutPending] = useState([]) // עמודים ששלחתם לזיהוי-מחדש ועוד לא חזרו
  const [submitted, setSubmitted] = useState([]) // ההגשות שלכם שממתינות לבדיקת מנהל
  // "שלח לזיהוי-מחדש" פתוח? (מתג המנהל — runtime.recutStatus; מגיע עם "העמודים שלי" ועם כל עמוד)
  const [recutOpen, setRecutOpen] = useState(true)
  const [heldAt, setHeldAt] = useState(null)
  const [missing, setMissing] = useState(null) // העמוד שביקשו ואינו בטיפולכם
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
  // הטיוטה עברה לגרסה חדשה של העמוד (drafts.cleanupPageDrafts): מה עבר ומה לא
  const [carried, setCarried] = useState(null)

  const role = session?.user?.role
  const canWork = session?.user?.isVerified || hasBookLibraryAccess(role) || hasOcrAccess(role)
  const editing = current?.mode === 'edit'

  const openPage = useCallback(
    async (id) => {
      setLoadingPage(true)
      setNote('')
      setSubmitCtx(null)
      setSubmitError(null)
      setCarried(null)
      try {
        const res = await fetch(`/api/page-proof/pages/${id}`)
        const received = Date.now()
        const data = await res.json()
        if (!data.success) throw new Error(data.error || 'העמוד לא נטען')
        if (typeof data.recutRequests === 'boolean') setRecutOpen(data.recutRequests)
        // הפתיחה חידשה את התפיסה — "שמור לך עד …" בפס-הרצף לפי המועד החדש
        if (data.leasedUntil) setSeq((s) => (s ? { ...s, pages: s.pages.map((p) => (p.id === id ? { ...p, leasedUntil: data.leasedUntil } : p)) } : s))
        const draftKey = pageDraftKey(data.page)
        // עריכה: ניקוי טיוטות של גרסאות אחרות (לפני שהעורך קורא את שלו); עמוד שחזר
        // מזיהוי-מחדש — מה שתקף מהטיוטה הקודמת עובר אליו. ואז הטיוטה שבשרת מול המקומית —
        // החדשה מבין השתיים נכנסת לעורך. עמוד שכבר הגשתם: הטיוטות שלו מיותרות.
        let draftInfo = null
        if (data.mode === 'edit') {
          const local = withStorage((s) => cleanupPageDrafts(s, data.page, draftKey))?.carried || null
          const skewMs = data.now ? Date.parse(data.now) - received : 0
          draftInfo = withStorage((s) => applyServerDraft(s, { pageId: data.page.id, draftKey, server: data.draft || null, skewMs }))
          setCarried((draftInfo?.source === 'server' && data.draft?.carried) || local)
        } else if (data.submission) withStorage((s) => removePageDrafts(s, data.page.id))
        setCurrent({ ...data, draftKey, draftInfo })
      } catch (e) {
        showAlert('שגיאה', failMessage(e, 'העמוד לא נטען — בדקו את החיבור ונסו שוב'))
      } finally {
        setLoadingPage(false)
      }
    },
    [showAlert]
  )

  // הכניסה: "העמודים שלי" (קריאה בלבד — שום עמוד אינו נתפס). עם ?page= — גם
  // הרצף של העמוד הזה, והוא נפתח אם הוא בטיפולכם או שהגשתם אותו
  const loadMine = useCallback(async () => {
    setLoading(true)
    setCurrent(null)
    const focus = focusRef.current
    focusRef.current = null
    try {
      const res = await fetch(`/api/page-proof/mine${focus ? `?page=${encodeURIComponent(focus)}` : ''}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'הטעינה נכשלה')
      setHeld(data.held || [])
      setRecutPending(data.recutPending || [])
      setSubmitted(data.submitted || [])
      if (typeof data.recutRequests === 'boolean') setRecutOpen(data.recutRequests)
      setHeldAt(new Date())
      setStats(data.stats)
      const asked = focus ? (data.sequence?.pages || []).find((p) => p.id === focus && p.state !== 'unavailable') : null
      setSeq(asked ? data.sequence : null)
      setMissing(focus && !asked ? data.unavailable || { id: focus } : null)
      if (asked) openPage(asked.id)
    } catch (e) {
      showAlert('שגיאה', failMessage(e, 'הטעינה נכשלה — בדקו את החיבור ונסו שוב'))
    } finally {
      setLoading(false)
    }
  }, [openPage, showAlert])

  useEffect(() => {
    if (status === 'authenticated' && canWork) loadMine()
    else if (status === 'authenticated') setLoading(false)
  }, [status, canWork, loadMine])

  // הכתובת בלי ?page= — כדי שרענון אחרי חזרה ל"העמודים שלי" לא יחזיר לעמוד הקודם
  const clearPageParam = useCallback(() => {
    if (searchParams?.get('page')) router.replace(BASE_PATH, { scroll: false })
  }, [router, searchParams])

  // עמוד מ"העמודים שלי" ← העורך (והכתובת מצביעה עליו, לרענון)
  const openHeld = useCallback(
    (sequence, pageId) => {
      setSeq(sequence)
      setMissing(null)
      router.replace(editorHref(pageId), { scroll: false })
      openPage(pageId)
    },
    [openPage, router]
  )

  // הגשה שממתינה לבדיקת מנהל (מ"העמודים שלי") ← הרצף שלה, והיא נפתחת לצפייה — כמו ?page=
  const openSubmitted = useCallback(
    (pageId) => {
      focusRef.current = pageId
      router.replace(editorHref(pageId), { scroll: false })
      loadMine()
    },
    [loadMine, router]
  )

  // חזרה ל"העמודים שלי" (הטיוטה של העמוד שבעורך שמורה בדפדפן)
  const showMine = () => {
    clearPageParam()
    setSeq(null)
    loadMine()
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
      const pages = seq.pages.map((p) => (p.id === page.id ? { ...p, state: 'submitted', submittedAt: new Date().toISOString() } : p))
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

  // "התחל מאפס" (טיוטה שהתקבלה ממתנדב קודם): הטיוטה באתר כבר התרוקנה — גם המקומית, והעמוד נטען מחדש
  // שתי גרסאות סותרות של הטיוטה (כאן ובאתר) — מה שהמתנדב בחר נכתב לטיוטה המקומית, ואז העורך נפתח
  const chooseDraft = useCallback(
    (choice) => {
      const cur = current
      if (!cur || cur.draftInfo?.source !== 'conflict') return
      const info = withStorage((s) =>
        resolveDraftConflict(s, { pageId: cur.page.id, draftKey: cur.draftKey, server: cur.draft || null, conflict: cur.draftInfo.conflict, choice })
      )
      setCurrent({ ...cur, draftInfo: info || { source: null, stage: cur.draft?.stage ?? null, srv: cur.draft?.updatedAt ?? null } })
    },
    [current]
  )

  const resetDraft = useCallback(
    (pageId) => {
      withStorage((s) => {
        removePageDrafts(s, pageId)
        removeDraftMeta(s, pageId)
      })
      openPage(pageId)
    },
    [openPage]
  )

  // שלב "מבנה" עם שינוי-חיתוך ← זיהוי-מחדש בלי מנהל (docs/63 §3; StagedEditor — אחרי שהטיוטה נשמרה באתר): רק
  // תיקוני-החיתוך נשלחים (השרת שומר רק אותם גם אם נשלח יותר); שאר התיקונים נשארים בטיוטה. העמוד עובר לזיהוי-מחדש
  // ויחזור אלינו לשלב "טקסט" — ממשיכים לעמוד הבא ברצף. ← {ok} או {ok:false, error} (העורך עובר לשלב "טקסט" כמו היום)
  const sendRecut = async ({ ops } = {}) => {
    const page = current?.page
    const cut = cleanOps((ops || []).filter(isCutOp))
    if (!page || !cut.length) return { ok: false, error: null }
    setSaving(true)
    try {
      const res = await fetch(`/api/page-proof/pages/${page.id}/recut-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: page.revision, ops: cut }),
      })
      const data = await res.json()
      // המנהל כיבה את השליחה בינתיים — ההסבר בעורך אומר להגיש כרגיל
      if (data.code === 'recut_off') setRecutOpen(false)
      if (!data.success) throw new Error(data.error || 'השליחה נכשלה')
      const pages = (seq?.pages || []).map((p) => (p.id === page.id ? { ...p, state: 'recut' } : p))
      if (seq) setSeq({ ...seq, pages })
      showAlert('נשלח לזיהוי-מחדש', STAGE_TEXT.recutSent)
      const next = pages.find((p) => p.state === 'mine')
      if (next) openPage(next.id)
      else setCurrent(null)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: failMessage(e, 'השליחה נכשלה — בדקו את החיבור') }
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
            <LoadingSpinner message="טוען את העמודים שלכם..." />
          ) : canWork && !seq ? (
            <MyPagesPanel
              held={held}
              recutPending={recutPending}
              submitted={submitted}
              missing={missing}
              onOpen={openHeld}
              onOpenSubmitted={openSubmitted}
              now={heldAt}
            />
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
                    disabled={p.state === 'unavailable' || p.state === 'recut' || loadingPage}
                    onClick={() => openPage(p.id)}
                    className={`rounded-md px-3 py-1 ${STATE_CLS[p.state]} ${current?.page?.id === p.id ? 'ring-2 ring-primary' : ''}`}
                    title={seqPageTitle(p, new Date())}
                  >
                    עמוד {p.page} · {STATE_HE[p.state]}
                    {p.revision > 1 && <span className="mr-1 rounded bg-warning-100 px-1 text-xs text-warning-800">מעבר שני</span>}
                  </button>
                ))}
                {(() => {
                  // העמוד שבעורך: עד מתי הוא שמור לכם (שבת וחג אינם נספרים — lease.js)
                  const cur = seq.pages.find((p) => p.id === current?.page?.id && p.state === 'mine')
                  const until = cur ? formatUntil(cur.leasedUntil, new Date()) : ''
                  return until ? (
                    <span data-testid="lease-until" className="text-xs text-on-surface/60" title="כל פתיחה של העמוד בעורך מחדשת את הזמן; שבת וחג אינם נספרים">
                      עמוד {cur.page} שמור לך עד {until}
                    </span>
                  ) : null
                })()}
                <span className="flex-1" />
                <button onClick={showMine} className="flex items-center gap-1 rounded-md px-3 py-1 hover:bg-surface-variant" title="כל העמודים שבטיפולכם">
                  <span aria-hidden="true" className="material-symbols-outlined text-base">person</span>
                  העמודים שלי
                </button>
                {seq.book?.gid && (
                  <Link href={bookHref(seq.book.gid)} className="flex items-center gap-1 rounded-md px-3 py-1 hover:bg-surface-variant" title="עמודים נוספים בספר הזה — בוחרים אותם ברשת-העמודים">
                    <span aria-hidden="true" className="material-symbols-outlined text-base">grid_view</span>
                    עמודים נוספים בספר
                  </Link>
                )}
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

              {editing && carried && !loadingPage && <DraftCarriedNotice carried={carried} onClose={() => setCarried(null)} />}

              {loadingPage ? (
                <LoadingSpinner message="טוען עמוד..." />
              ) : current && editing && current.draftInfo?.source === 'conflict' ? (
                <DraftConflictNotice conflict={current.draftInfo.conflict} onChoose={chooseDraft} />
              ) : current && editing ? (
                <StagedEditor
                  key={current.draftKey}
                  current={current}
                  help={recutOpen ? undefined : RECUT_OFF_HELP}
                  recutOpen={recutOpen}
                  saving={saving}
                  onSubmit={openSubmit}
                  onSendRecut={sendRecut}
                  onReset={() => resetDraft(current.page.id)}
                  onReload={() => openPage(current.page.id)}
                />
              ) : current ? (
                <ProofEditor
                  key={current.draftKey}
                  page={current.page}
                  draftKey={current.draftKey}
                  readOnly
                  initialOps={current.submission?.ops || []}
                  help={recutOpen ? undefined : RECUT_OFF_HELP}
                  actions={() => (
                    <span className="rounded bg-info-100 px-2 py-1 text-xs text-info-800">
                      {current.submission?.status === 'approved'
                        ? 'ההגשה שלכם אושרה'
                        : submittedWaiting(current.submission?.createdAt ? formatSince(current.submission.createdAt, new Date()) : '')}
                    </span>
                  )}
                />
              ) : (
                <div className="glass-strong flex flex-col items-center gap-4 rounded-xl p-8 text-center">
                  <p className="font-medium text-on-surface/70">
                    {remaining === 0 ? 'סיימתם את הרצף — תודה!' : 'בחרו עמוד מהרצף'}
                  </p>
                  {remaining === 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {seq.book?.gid && (
                        <Link
                          href={bookHref(seq.book.gid)}
                          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-bold text-on-primary hover:opacity-90"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined">grid_view</span>
                          לבחירת העמודים הבאים בספר
                        </Link>
                      )}
                      <button onClick={showMine} className="flex items-center gap-1 rounded-full px-3 py-3 text-on-surface/80 transition-colors hover:bg-surface-variant">
                        <span aria-hidden="true" className="material-symbols-outlined text-base">person</span>
                        העמודים שלי
                      </button>
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
