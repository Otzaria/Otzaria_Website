'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import LabelChips from '@/components/corrections/LabelChips'
import LineBox from '@/components/corrections/LineBox'
import TextDiff from '@/components/corrections/TextDiff'
import ChangeDiff from '@/components/corrections/ChangeDiff'
import ReportActions from '@/components/corrections/ReportActions'
import HistoryPanel from '@/components/corrections/HistoryPanel'
import { committedNewLine } from '@/lib/corrections/unified-diff'

const ERRORS = {
  stale_view: 'התצוגה לא עדכנית — הדיווח או המקור השתנו מאז שנטען. רעננו ובדקו שוב.',
  claim_conflict: 'מתנדב אחר כבר לקח את הדיווח.',
  claim_required: 'יש לקחת את הדיווח לטיפול קודם (או שתוקף השיוך פג).',
  source_not_resolved: 'המקור לא אותר בוודאות או השתנה — אי אפשר לאשר. אפשר לבחור מקור ידנית ולערוך.',
  final_state: 'הדיווח כבר סגור.',
  reason_required: 'חובה לציין סיבה.',
  service_disabled: 'שירות הבדיקה אינו פעיל.',
  path_not_allowed: 'הנתיב אינו מותר (רק קבצי txt תחת תיקיות הספרים במאגר).',
  no_proposal: 'אין הצעת תיקון — השתמשו ב"עריכה ואז אישור".',
  proposal_identical: 'הנוסח זהה למקור.',
  source_unavailable: 'לא ניתן לקרוא את המקור מ-GitHub כרגע.',
  Forbidden: 'אין לך הרשאה לפעולה זו.',
}

const SOURCE_STATUS = {
  exact: 'אותר בדיוק',
  relocated: 'אותר (השורה זזה בקובץ)',
  already_applied: 'התיקון כבר קיים במקור',
  source_changed: 'השורה במקור השתנתה',
  selection_not_found: 'השורה לא נמצאה',
  not_found: 'הקובץ לא נמצא במאגר',
  ambiguous: 'כמה התאמות — עמום',
  manual_only: 'נדרש איתור ידני',
  no_proposal: 'אין שורה מקורית (דיווח חופשי)',
  invalid_path: 'נתיב לא מורשה',
}

export default function CorrectionReportPage() {
  const { id } = useParams()
  const { data: session } = useSession()
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [contextLines, setContextLines] = useState(null)
  const [expanding, setExpanding] = useState(false)
  const shown = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/corrections/reports/${id}${contextLines === null ? '' : `?context=${contextLines}`}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(ERRORS[body.error] || body.error || 'שגיאה בטעינה')
      setDetail(body)
      setStale(false)
      shown.current = { generation: body.report.generation, blob: body.source?.blobSha ?? null }
    } catch (e) {
      setError(e.message)
    } finally {
      setExpanding(false)
    }
  }, [id, contextLines])

  useEffect(() => { load() }, [load])

  // בדיקה תקופתית: מתנדב אחר או שינוי במקור → הודעה (בלי להחליף את התצוגה מתחת לידיים).
  useEffect(() => {
    const t = setInterval(async () => {
      if (!shown.current) return
      try {
        const res = await fetch(`/api/corrections/reports/${id}`, { cache: 'no-store' })
        if (!res.ok) return
        const b = await res.json()
        if (b.report.generation !== shown.current.generation || (b.source?.blobSha ?? null) !== shown.current.blob) setStale(true)
      } catch { /* ננסה שוב בסבב הבא */ }
    }, 30_000)
    return () => clearInterval(t)
  }, [id])

  const run = async (body, opts = {}) => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/corrections/reports/${id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setNotice({ tone: 'danger', text: ERRORS[data.error] || data.error || 'הפעולה נכשלה' })
        if (data.error === 'stale_view' || data.error === 'claim_conflict') setStale(true)
        return false
      }
      if (opts.keep) return data
      if (body.action === 'approve' || body.action === 'edit_approve') {
        setNotice({
          tone: 'success',
          text: data.result === 'already_fixed' ? 'נסגר: התיקון כבר קיים במקור.'
            : data.publishMode === 'disabled' ? 'אושר. הפרסום ל-GitHub כבוי כרגע — הדיווח ממתין לפרסום.' : 'אושר וממתין לפרסום.',
        })
      }
      await load()
      return true
    } catch {
      setNotice({ tone: 'danger', text: 'שגיאת רשת' })
      return false
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="bg-danger-50 text-danger-700 border border-danger-200 rounded-lg p-4">{error}</div>
  if (!detail) return <LoadingSpinner />
  const { report, source, sourceError } = detail
  const rev = report.proposals.find((p) => p.revision === report.currentRevision) || null
  const currentLine = source?.currentLine ?? null
  const targetLine = rev ? rev.newLine : null
  const sourceSubtitle = source ? `${SOURCE_STATUS[source.status] || source.status}${source.path ? ` · ${source.path}` : ''}${Number.isInteger(source.lineIndex) ? ` · שורה ${source.lineIndex + 1}` : ''}${source.commitSha ? ` · ${source.commitSha.slice(0, 8)}` : ''}` : sourceError ? `המקור אינו זמין כרגע (${sourceError})` : 'לא נטען'
  // הקשר מהקובץ רק כשהשורה אותרה בוודאות; אחרת — השורה מהדיווח בלבד, בלי מספרים מנוחשים.
  const fileDiff = source?.context && (source.status === 'exact' || source.status === 'relocated')
  const diff = fileDiff
    ? { before: source.currentLine, after: committedNewLine(source, targetLine), context: source.context, lineIndex: source.lineIndex, path: source.path, contextNote: null }
    : {
        before: rev?.originalLine ?? '', after: targetLine, context: null, lineIndex: null, path: null,
        contextNote: `הקשר מהקובץ אינו זמין (${source ? SOURCE_STATUS[source.status] || source.status : sourceError ? 'המקור אינו זמין כרגע' : 'המקור לא נטען'}) — מוצגת השורה כפי שנשלחה מהתוכנה.`,
      }
  const expandContext = () => {
    setExpanding(true)
    setContextLines((source?.context?.contextLines ?? 3) + 10)
  }

  return (
    <div className="space-y-4">
      <Link href="/library/corrections" className="text-sm text-primary flex items-center gap-1"><span className="material-symbols-outlined text-base">arrow_forward</span> חזרה לתור</Link>

      {stale && (
        <div className="bg-warning-50 border border-warning-200 text-warning-800 rounded-lg p-3 flex items-center justify-between gap-2">
          <span>התצוגה לא עדכנית: מתנדב אחר פעל על הדיווח או שהמקור השתנה.</span>
          <button onClick={load} className="px-3 py-1 rounded-lg bg-warning-600 text-white text-sm">רענון</button>
        </div>
      )}
      {notice && <div className={`rounded-lg p-3 border ${notice.tone === 'success' ? 'bg-success-50 border-success-200 text-success-800' : 'bg-danger-50 border-danger-200 text-danger-700'}`}>{notice.text}</div>}

      <header className="glass rounded-xl p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-bold">{report.bookTitle} <span className="font-normal text-on-surface/60 text-lg">— {report.currentRef}</span></h2>
          <LabelChips labels={report.labels} />
        </div>
        <div className="text-xs text-on-surface/60 flex flex-wrap gap-x-4">
          <span>{report.kind === 'text_correction' ? 'הצעת תיקון' : 'דיווח חופשי'}</span>
          <span dir="ltr">{report.sourceFolder}</span>
          <span>גרסת ספרייה: {report.location?.libraryBuildId || report.libraryVersion}</span>
          {report.manual?.handoffLabel && <span>סיבת העברה: {report.manual.handoffLabel}</span>}
          <span>נקלט: {new Date(report.createdAt).toLocaleString('he-IL')}</span>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-xl p-4">
          <h3 className="font-bold mb-2">הסבר המשתמש</h3>
          <p className="whitespace-pre-wrap break-words">{report.errorDetails}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <h3 className="font-bold">הנוסח שראה המשתמש</h3>
          <p className="text-xs text-on-surface/60 mb-2">צילום תצוגה מהתוכנה (אחרי עיבוד) — אינו המקור</p>
          <p className="whitespace-pre-wrap break-words">{report.selectedText}</p>
          {report.contextText && <p className="whitespace-pre-wrap break-words text-sm text-on-surface/60 mt-2">{report.contextText}</p>}
        </div>
      </section>

      {rev && (
        <>
          <ChangeDiff
            title={fileDiff ? 'השינוי בקובץ המקור' : 'השינוי בשורה'}
            description={sourceSubtitle}
            {...diff}
            onExpand={fileDiff ? expandContext : null}
            expanding={expanding}
            split={(
              <div className="space-y-4">
                <section className="grid gap-4 md:grid-cols-2">
                  <LineBox
                    title="המקור העדכני במאגר"
                    tone="source"
                    subtitle={sourceSubtitle}
                    text={currentLine}
                    empty="לא אותרה שורה מתאימה במקור"
                  />
                  <LineBox title="התוצאה המיועדת" tone="target" subtitle={`גרסת הצעה ${rev.revision}`} text={targetLine} empty="לא הוצע נוסח (ללא הצעה)" />
                </section>
                {currentLine !== null && targetLine !== null && <TextDiff before={currentLine} after={targetLine} />}
                {currentLine === null && targetLine !== null && (
                  <div>
                    <p className="text-xs text-on-surface/60 mb-2">השורה לא אותרה במקור העדכני; זו ההשוואה מול העותק שנשלח מהתוכנה.</p>
                    <TextDiff before={rev.originalLine} after={targetLine} />
                  </div>
                )}
              </div>
            )}
          />
          {source?.candidates?.length > 0 && (
            <section className="glass rounded-xl p-4">
              <h3 className="font-bold mb-2">מועמדים (התאמה לא ודאית — לבחירה ידנית בלבד)</h3>
              <ul className="text-sm space-y-1">
                {source.candidates.map((c, i) => (
                  <li key={i} className="whitespace-pre-wrap break-words"><span dir="ltr" className="text-xs text-on-surface/50 ml-2">{c.path}{Number.isInteger(c.lineIndex) ? `:${c.lineIndex + 1}` : ''}</span>{c.line}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ReportActions detail={detail} meId={session?.user?.id} busy={busy} run={run} />
      <HistoryPanel detail={detail} />
    </div>
  )
}
