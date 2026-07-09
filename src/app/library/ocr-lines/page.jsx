'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import OcrLineContextModal from '@/components/ocr/OcrLineContextModal'
import { normalizeLineText, findForbidden } from '@/lib/ocr/textStandard'
import { hasBookLibraryAccess } from '@/lib/roles'

// כללי התמלול המוצגים למשתמש — נגזרים מתקן הטקסט של פרויקט ה-OCR.
const RULES = [
  'הקלידו בדיוק את מה שכתוב בתמונה, אות באות — בלי לתקן, לשנות או "לשפר" את הנוסח.',
  'אין לפתוח ראשי תיבות וקיצורים — כתבו אותם כפי שהם מופיעים, כולל הגרש/גרשיים.',
  'תווים מותרים בלבד: אותיות עבריות א–ת (כולל סופיות ך ם ן ף ץ), ספרות 0–9, ופיסוק: . , : ; ! ? ( ) [ ] מקפים - ־ – — גרש ׳ וגרשיים ״.',
  'ללא ניקוד וטעמים — גם אם מופיעים בתמונה (מוסרים אוטומטית בשמירה).',
  'אין להקליד סימני הפניה להערות שוליים כשהם בכתב שונה משאר השורה (אות זעירה, כוכבית וכדומה) — פשוט דלגו עליהם.',
  'גרש וגרשיים אפשר להקליד במקלדת רגילה (\' ") — הם מומרים אוטומטית לצורה העברית (׳ ״).',
  'רווח יחיד בין מילים; רווחים בתחילת השורה ובסופה מוסרים אוטומטית.',
  'ליד כל שורה מוצג סוג הכתב (מרובע / רש״י). אם הסיווג שגוי — החליפו אותו; השינוי יועבר לאישור מנהל.',
  'שורה לא קריאה, חתוכה או פגומה? דלגו עליה — רענון הדף יביא שורות אחרות.',
]

const SCRIPT_LABELS = { square: 'מרובע', rashi: 'רש״י' }

// שורת תמלול בודדת: תמונה מימין, הזנת טקסט משמאל. מנהלת את הטקסט שלה מקומית,
// כך שהחלפת שורה אחרת בדף אינה מרנדרת אותה מחדש.
function LineRow({ line, onSave, onOpenContext }) {
  const [text, setText] = useState('')
  const [script, setScript] = useState(line.scriptType || 'square')
  const [saving, setSaving] = useState(false)

  const forbidden = useMemo(() => findForbidden(text), [text])
  const canSave = !saving && forbidden.length === 0 && !!normalizeLineText(text)
  const scriptChanged = script !== (line.scriptType || 'square')

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(line, text, script)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-strong rounded-xl p-4 flex flex-col md:flex-row gap-4 items-stretch animate-in fade-in duration-300">
      {/* תמונת השורה (מימין ב-RTL) */}
      <div className="md:w-1/2 flex flex-col gap-2">
        <div className="bg-white border border-neutral-200 rounded-lg p-2 flex items-center justify-center min-h-[64px]">
          <img
            src={`/api/ocr-lines/${line.id}/image`}
            alt="שורה לתמלול"
            className="max-h-24 w-full object-contain"
            draggable={false}
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => onOpenContext(line)}
            className="text-info-600 hover:bg-info-50 px-2 py-1 rounded-lg transition-colors text-sm flex items-center gap-1"
            title="הצגת העמוד המלא סביב השורה"
          >
            <span className="material-symbols-outlined text-sm">pageview</span>
            הצג את העמוד המלא
          </button>

          {/* בורר סוג כתב — שינוי מהסיווג המקורי נשלח כהצעה לאישור מנהל */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-on-surface/60">סוג הכתב:</span>
            {['square', 'rashi'].map((s) => (
              <button
                key={s}
                onClick={() => setScript(s)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-all border ${
                  script === s
                    ? s === 'rashi'
                      ? 'bg-warning-alt-100 text-warning-alt-800 border-warning-alt-300'
                      : 'bg-info-100 text-info-800 border-info-300'
                    : 'bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400'
                }`}
              >
                {SCRIPT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        {scriptChanged && (
          <div className="text-xs text-warning-alt-800 bg-warning-alt-50 border border-warning-alt-200 rounded-lg px-2 py-1 flex items-center gap-1 self-start">
            <span className="material-symbols-outlined text-xs">pending</span>
            שינוי סוג הכתב יועבר לאישור מנהל בעת השמירה
          </div>
        )}
      </div>

      {/* הזנת הטקסט (משמאל) */}
      <div className="md:w-1/2 flex flex-col gap-2">
        <input
          type="text"
          dir="rtl"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="הקלידו כאן את טקסט השורה במדויק..."
          className="border border-neutral-300 rounded-lg p-3 text-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 w-full"
        />
        {forbidden.length > 0 && (
          <div className="text-sm text-danger-600 flex items-center gap-1 flex-wrap">
            <span className="material-symbols-outlined text-sm">error</span>
            תווים לא מותרים:
            {forbidden.map((c) => (
              <span key={c} className="px-1.5 py-0.5 bg-danger-50 border border-danger-200 rounded font-mono font-bold">
                {c}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex justify-start">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-primary hover:opacity-90 text-on-primary font-bold px-6 py-2 rounded-lg transition-all disabled:opacity-40 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">{saving ? 'hourglass_top' : 'save'}</span>
            {saving ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OcrLinesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert } = useDialog()

  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [savedCount, setSavedCount] = useState(0)
  const [contextLine, setContextLine] = useState(null)
  const [rulesOpen, setRulesOpen] = useState(true)

  // זהה לתנאי בצד השרת (requireVerifiedSession): מאומת או מנהל ספרייה
  const canWork = session?.user?.isVerified || hasBookLibraryAccess(session?.user?.role)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/ocr-lines')
      const data = await res.json()
      if (data.success) setLines(data.lines)
      else if (data.error) showAlert('שגיאה', data.error)
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
      router.push('/library/auth/login?callbackUrl=/library/ocr-lines')
    } else if (status === 'authenticated') {
      if (session?.user?.isVerified || hasBookLibraryAccess(session?.user?.role)) load()
      else setLoading(false)
    }
  }, [status, session, router, load])

  // שמירה: השורה ששמורה יוצאת מהדף ובמקומה נכנסת חלופית מהשרת — שאר השורות
  // אינן מתרנדרות מחדש (key לפי id שומר עליהן mounted).
  const handleSave = async (line, text, scriptType) => {
    try {
      const res = await fetch(`/api/ocr-lines/${line.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, scriptType, excludeIds: lines.map((l) => l.id) }),
      })
      const data = await res.json()

      const replaceWith = data.next || null
      if (data.success) {
        setSavedCount((n) => n + 1)
        setLines((prev) =>
          replaceWith
            ? prev.map((l) => (l.id === line.id ? replaceWith : l))
            : prev.filter((l) => l.id !== line.id)
        )
      } else if (res.status === 409) {
        // מישהו הקדים אותנו — מחליפים את השורה בכל מקרה
        showAlert('השורה נתפסה', data.error || 'השורה כבר תומללה על ידי משתמש אחר')
        setLines((prev) =>
          replaceWith
            ? prev.map((l) => (l.id === line.id ? replaceWith : l))
            : prev.filter((l) => l.id !== line.id)
        )
      } else {
        showAlert('שגיאה', data.error || 'שגיאה בשמירת השורה')
      }
    } catch {
      showAlert('שגיאה', 'תקלה בתקשורת')
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1 w-full px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-4xl text-accent">edit_note</span>
                תמלול שורות לאימון OCR
              </h1>
              <p className="text-on-surface/60 mt-2">
                מוצגות {lines.length > 0 ? lines.length : 10} שורות אקראיות. הקלידו את הטקסט המדויק של כל שורה ולחצו שמור —
                שורה שנשמרה מוחלפת מיד בשורה חדשה.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {savedCount > 0 && (
                <span className="px-3 py-1.5 rounded-full bg-success-100 text-success-800 text-sm font-bold">
                  נשמרו {savedCount} שורות
                </span>
              )}
              <button
                onClick={load}
                disabled={loading || !canWork}
                className="glass text-on-surface hover:bg-surface-variant px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-40"
                title="החלפת כל השורות המוצגות בשורות אקראיות אחרות"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                החלף הכל
              </button>
            </div>
          </div>

          {/* כללי התמלול */}
          <div className="mb-6 glass-strong rounded-xl overflow-hidden">
            <button
              onClick={() => setRulesOpen((v) => !v)}
              className="w-full flex items-center justify-between p-4 font-bold text-on-surface hover:bg-surface-variant/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-warning-alt-600">gavel</span>
                כללי התמלול — חובה לקרוא לפני שמתחילים
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
              רק משתמשים עם כתובת אימייל מאומתת יכולים לצפות בשורות ולתמלל.
            </div>
          )}

          {loading ? (
            <LoadingSpinner message="טוען שורות..." />
          ) : lines.length === 0 ? (
            canWork && (
              <div className="glass-strong rounded-xl p-10 text-center text-on-surface/60">
                אין כרגע שורות זמינות לתמלול. נסו שוב מאוחר יותר — תודה על העזרה!
              </div>
            )
          ) : (
            <div className="flex flex-col gap-4">
              {lines.map((line) => (
                <LineRow key={line.id} line={line} onSave={handleSave} onOpenContext={setContextLine} />
              ))}
            </div>
          )}
        </div>
      </main>

      {contextLine && <OcrLineContextModal line={contextLine} onClose={() => setContextLine(null)} />}
    </div>
  )
}
