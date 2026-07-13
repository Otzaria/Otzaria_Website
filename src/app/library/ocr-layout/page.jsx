'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  PagenumTaskCard,
  HeaderTaskCard,
  StreamsTaskCard,
  ZonesFullCard,
} from '@/components/ocr/layout/LayoutTaskCards'
import { validateAnswer } from '@/lib/ocr/layoutValidation'
import { hasBookLibraryAccess } from '@/lib/roles'

// דף המתנדב לתיוג מבנה-עמוד: עמוד אחד בכל פעם, כל השאלות שלו יחד.
// העיקרון: המכונה כבר עשתה את העבודה — המתנדב רק מכריע. ברוב המקרים
// לחיצת "נכון" אחת או הקלדת ערך קצר. ההגשות ממתינות לאישור מנהל.

const RULES = [
  'המחשב כבר ניתח את העמוד — אתם רק בודקים אותו: אם מה שמוצג נכון, לחצו "נכון" (או "הכול נכון" כשהכול מדויק) והמשיכו.',
  'מספר עמוד: השוו את הערך הצפוי למה שכתוב בתמונה. אם שונה — הקלידו בדיוק את מה שכתוב (גימטריה כמו "קכג" או ספרות). אם אין בעמוד מספר כלל — "אין מספר עמוד".',
  'כותרת רצה: הכותרת החוזרת בראש העמוד (שם הספר/המסכת). אם התיבה הכתומה לא עוטפת אותה — גררו ותקנו; אם אין כותרת בעמוד — סמנו זאת.',
  'חלוקת זרמים: הרצועות הצבעוניות מפרידות בין אזורי הטקסט (פנים, הערות וכדומה). גררו את הגבולות למקום המדויק ובחרו לכל רצועה את זהותה מהמקרא.',
  'ספק = דילוג: אם העמוד לא ברור (סריקה פגומה, מבנה מוזר) — לחצו "דלג" ותקבלו עמוד אחר. עדיף לדלג מלנחש.',
  'קיצורי מקלדת: Enter = שמירת ההכרעות (או "הכול נכון" אם טרם נגעתם בכלום), N = דילוג לעמוד הבא.',
  'כל הגשה נבדקת ומאושרת בידי מנהל לפני שהיא חוזרת לפרויקט ה-OCR.',
]

export default function OcrLayoutPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert } = useDialog()

  const [page, setPage] = useState(null)
  const [answers, setAnswers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState(null)
  const [rulesOpen, setRulesOpen] = useState(true)
  // עמודים שדולגו בדף הנוכחי — לא יוצעו שוב למתנדב הזה
  const skippedRef = useRef([])

  // זהה לתנאי בצד השרת (requireVerifiedSession): מאומת או מנהל ספרייה
  const canWork = session?.user?.isVerified || hasBookLibraryAccess(session?.user?.role)

  const load = useCallback(async (extraExclude = []) => {
    try {
      setLoading(true)
      const exclude = [...skippedRef.current, ...extraExclude].slice(-10)
      const qs = exclude.length ? `?exclude=${exclude.join(',')}` : ''
      const res = await fetch(`/api/ocr-layout${qs}`)
      const data = await res.json()
      if (data.success) {
        setPage(data.page)
        setAnswers(data.page ? data.page.tasks.map(() => null) : [])
        if (data.stats) setStats(data.stats)
      } else if (data.error) showAlert('שגיאה', data.error)
    } catch {
      showAlert('שגיאה', 'תקלה בתקשורת')
    } finally {
      setLoading(false)
    }
  // showAlert יציב מספיק; לא תלות אמיתית
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/library/auth/login?callbackUrl=/library/ocr-layout')
    } else if (status === 'authenticated') {
      if (session?.user?.isVerified || hasBookLibraryAccess(session?.user?.role)) load()
      else setLoading(false)
    }
  }, [status, session, router, load])

  // תקפות ההכרעות — אותם כללים כמו בשרת (ולידציה כפולה)
  const allValid = useMemo(() => {
    if (!page || answers.length !== page.tasks.length) return false
    return page.tasks.every((t, i) => {
      const a = answers[i]
      if (!a) return false
      if (a.confirmed) return true
      return validateAnswer(t.kind, a.answer, t.prefill, page.imageWidth, page.imageHeight) === null
    })
  }, [page, answers])

  const untouched = answers.every((a) => a === null)

  const setAnswer = useCallback((i, v) => {
    setAnswers((prev) => prev.map((a, j) => (j === i ? v : a)))
  }, [])

  const save = useCallback(async (payload) => {
    if (!page || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/ocr-layout/${page.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payload }),
      })
      const data = await res.json()
      if (data.success) {
        setStats((s) => (s ? { ...s, done: s.done + 1, mine: s.mine + 1 } : s))
        await load()
      } else if (res.status === 409) {
        // מישהו הקדים אותנו — עוברים לעמוד אחר
        showAlert('העמוד נתפס', data.error || 'העמוד כבר תויג על ידי משתמש אחר')
        await load([page.id])
      } else {
        showAlert('שגיאה', data.error || 'שגיאה בשמירה')
      }
    } catch {
      showAlert('שגיאה', 'תקלה בתקשורת')
    } finally {
      setSaving(false)
    }
  // showAlert יציב מספיק; לא תלות אמיתית
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, saving, load])

  const handleSave = useCallback(() => {
    if (allValid) save(answers)
  }, [allValid, answers, save])

  // "הכול נכון" — כל ה-prefill מדויק; השרת ממחיש את התשובות מהמכונה
  const handleAllCorrect = useCallback(() => {
    if (!page) return
    save(page.tasks.map(() => ({ confirmed: true, answer: null })))
  }, [page, save])

  const handleSkip = useCallback(() => {
    if (!page) return
    skippedRef.current = [...skippedRef.current, page.id].slice(-8)
    load()
  }, [page, load])

  // קיצורי מקלדת: Enter=אישור/שמירה, N=הבא
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.key === 'Enter') {
        e.preventDefault()
        if (allValid) handleSave()
        else if (untouched) handleAllCorrect()
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        handleSkip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [allValid, untouched, handleSave, handleAllCorrect, handleSkip])

  const imageBase = page ? `/api/ocr-layout/${page.id}/image` : ''

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 w-full px-6 py-10">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-accent">space_dashboard</span>
                תיוג מבנה עמוד לפרויקט ה-OCR
              </h1>
              <p className="text-on-surface/60 mt-2">
                המחשב ניתח את העמוד וסימן את מה שלא הצליח להכריע — אתם רק בודקים ומכריעים.
                ברוב העמודים מספיקה לחיצת ״נכון״ אחת.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {stats && (
                <span
                  className="px-3 py-1.5 rounded-full bg-info-100 text-info-800 text-sm font-bold"
                  title="עמודים שתויגו (כולל ממתינים לאישור) מתוך כלל המאגר"
                >
                  נעשו {stats.done.toLocaleString('he-IL')} מתוך {stats.total.toLocaleString('he-IL')} עמודים
                </span>
              )}
              {stats && stats.mine > 0 && (
                <span className="px-3 py-1.5 rounded-full bg-success-100 text-success-800 text-sm font-bold">
                  שלכם: {stats.mine.toLocaleString('he-IL')}
                </span>
              )}
            </div>
          </div>

          {/* כללי התיוג */}
          <div className="mb-6 glass-strong rounded-xl overflow-hidden">
            <button
              onClick={() => setRulesOpen((v) => !v)}
              className="w-full flex items-center justify-between p-4 font-bold text-on-surface hover:bg-surface-variant/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-warning-alt-600">gavel</span>
                איך מתייגים — חובה לקרוא לפני שמתחילים
              </span>
              <span className="material-symbols-outlined">{rulesOpen ? 'expand_less' : 'expand_more'}</span>
            </button>
            {rulesOpen && (
              <ol className="px-6 pb-4 space-y-1.5 list-decimal pr-10 text-on-surface/80 text-sm leading-relaxed">
                {RULES.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            )}
          </div>

          {!canWork && status === 'authenticated' && (
            <div className="mb-6 bg-warning-alt-50 border border-warning-alt-200 text-warning-alt-800 rounded-xl p-4 flex items-center gap-2">
              <span className="material-symbols-outlined">info</span>
              רק משתמשים עם כתובת אימייל מאומתת יכולים לצפות בעמודים ולתייג.
            </div>
          )}

          {loading ? (
            <LoadingSpinner message="טוען עמוד..." />
          ) : !page ? (
            canWork && (
              <div className="glass-strong rounded-xl p-10 text-center flex flex-col items-center gap-4">
                <p className="text-on-surface/70 font-medium">
                  אין כרגע עמודים זמינים לתיוג — תודה רבה על העזרה!
                </p>
                <button
                  onClick={() => load()}
                  className="bg-primary hover:opacity-90 text-on-primary font-bold px-6 py-3 rounded-lg transition-all flex items-center gap-2"
                >
                  <span className="material-symbols-outlined">autorenew</span>
                  בדוק שוב
                </button>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-4">
              {/* סרגל פעולות עליון — עמוד אחד = מסך אחד */}
              <div className="glass-strong rounded-xl p-4 flex items-center justify-between flex-wrap gap-3 sticky top-2 z-10">
                <div className="flex items-center gap-2 text-sm text-on-surface/70">
                  <span className="material-symbols-outlined text-sm">quiz</span>
                  {page.tasks.length === 1 ? 'שאלה אחת בעמוד זה' : `${page.tasks.length} שאלות בעמוד זה`}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleAllCorrect}
                    disabled={saving || !untouched}
                    title={untouched ? 'כל מה שהמחשב זיהה בעמוד הזה מדויק (Enter)' : 'כבר נגעתם בהכרעות — השתמשו בשמירה'}
                    className="bg-success-600 hover:bg-success-700 text-white font-bold px-5 py-2 rounded-lg transition-all disabled:opacity-40 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">done_all</span>
                    הכול נכון
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!allValid || saving}
                    title="שמירת ההכרעות שסימנתם (Enter)"
                    className="bg-primary hover:opacity-90 text-on-primary font-bold px-5 py-2 rounded-lg transition-all disabled:opacity-40 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">{saving ? 'hourglass_top' : 'save'}</span>
                    {saving ? 'שומר...' : 'שמור הכרעות'}
                  </button>
                  <button
                    onClick={handleSkip}
                    disabled={saving}
                    title="דילוג לעמוד אחר (N)"
                    className="glass text-on-surface hover:bg-surface-variant px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-sm">skip_next</span>
                    דלג
                  </button>
                </div>
              </div>

              {/* כרטיסי המשימות */}
              {page.tasks.map((t, i) => (
                <div key={`${page.id}-${i}`} className="glass-strong rounded-xl p-4 animate-in fade-in duration-300">
                  {t.kind === 'pagenum' && (
                    <PagenumTaskCard
                      prefill={t.prefill}
                      imgSrc={`${imageBase}?task=${i}`}
                      value={answers[i]}
                      onChange={(v) => setAnswer(i, v)}
                    />
                  )}
                  {t.kind === 'header' && (
                    <HeaderTaskCard
                      prefill={t.prefill}
                      imageUrl={imageBase}
                      imageWidth={page.imageWidth}
                      imageHeight={page.imageHeight}
                      value={answers[i]}
                      onChange={(v) => setAnswer(i, v)}
                    />
                  )}
                  {t.kind === 'streams' && (
                    <StreamsTaskCard
                      prefill={t.prefill}
                      imageUrl={imageBase}
                      imageWidth={page.imageWidth}
                      imageHeight={page.imageHeight}
                      value={answers[i]}
                      onChange={(v) => setAnswer(i, v)}
                    />
                  )}
                  {t.kind === 'zones-full' && (
                    <ZonesFullCard
                      prefill={t.prefill}
                      imageUrl={imageBase}
                      pagenumImgSrc={t.prefill.pagenum ? `${imageBase}?task=${i}&part=pagenum` : null}
                      imageWidth={page.imageWidth}
                      imageHeight={page.imageHeight}
                      value={answers[i]}
                      onChange={(v) => setAnswer(i, v)}
                    />
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
