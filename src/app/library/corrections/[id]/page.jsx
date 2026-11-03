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
import { errorText } from '@/lib/corrections/error-text'
import { githubFileUrl } from '@/lib/corrections/github-link'
import { reportedLinePick } from '@/lib/corrections/reported-line'

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
  const [sourcePick, setSourcePick] = useState(null)
  const shown = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/corrections/reports/${id}${contextLines === null ? '' : `?context=${contextLines}`}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(errorText(body, 'שגיאה בטעינה'))
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

  // בקשה שקטה (בלי busy והודעה בראש הדף) — לבדיקות רקע כמו תקינות הנתיב בבחירת מקור ידנית
  const probe = useCallback(async (body) => {
    const res = await fetch(`/api/corrections/reports/${id}/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return { ok: res.ok, data: await res.json() }
  }, [id])

  // opts.quiet — השגיאה חוזרת למקרא ({errorText}) ומוצגת ליד השדות, לא בראש הדף.
  const run = async (body, opts = {}) => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/corrections/reports/${id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        if (opts.quiet) return { errorText: errorText(data) }
        setNotice({ tone: 'danger', text: errorText(data) })
        if (data.error === 'stale_view' || data.error === 'claim_conflict') setStale(true)
        // לקיחה אוטומטית הצליחה והפעולה נכשלה: הגרסה התקדמה — מרעננים כדי שהניסיון הבא לא ייפול על "לא עדכני".
        if (opts.reloadOnFail) await load()
        return false
      }
      if (opts.keep) return data
      if (body.action === 'reject_approved') {
        setNotice(data.prClosed === false
          ? { tone: 'danger', text: `הדיווח נדחה, אבל סגירת PR #${data.prNumber} ב-GitHub נכשלה — יש לסגור אותו ידנית.` }
          : { tone: 'success', text: data.prNumber ? `הדיווח נדחה ו-PR #${data.prNumber} נסגר.` : 'הדיווח נדחה והפרסום בוטל.' })
      }
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
      if (opts.quiet) return { errorText: 'שגיאת רשת' }
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
  // השורה לא אותרה בוודאות אבל הקובץ כן: קישור לספר בגיטהאב, ממוקד בשורה שדווחה (אם ידועה), לחיפוש ידני
  const githubUrl = source?.path && !fileDiff
    ? githubFileUrl({ repo: source.repo, ref: source.ref, path: source.path, lineIndex: source.lineIndex ?? report.location?.lineIndex ?? null })
    : null
  // מספר השורה שנשלח בדיווח (בתוסף תיקוני ספרים — בדרך כלל מדויק): טעינה ישירה מהמקור, בלי חיפוש בגיטהאב
  const reportedPick = reportedLinePick({ report, source, located: Boolean(fileDiff) })
  const expandContext = () => {
    setExpanding(true)
    setContextLines((source?.context?.contextLines ?? 3) + 10)
  }

  return (
    <div className="space-y-4">
      {/* נשאר גלוי בגלילה, מתחת לכותרת האתר (sticky top-0, h-16) — כולל הודעת התוצאה/השגיאה של הפעולה האחרונה */}
      <div className="sticky top-16 z-40 -mx-1 px-1 py-2 bg-background/95 backdrop-blur-sm space-y-2">
        <Link href="/library/corrections" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <span className="material-symbols-outlined text-base">arrow_forward</span> חזרה לתור
        </Link>
        {notice && (
          <div role="status" className={`rounded-lg p-3 border flex items-start justify-between gap-2 ${notice.tone === 'success' ? 'bg-success-50 border-success-200 text-success-800' : 'bg-danger-50 border-danger-200 text-danger-700'}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="סגירת ההודעה" className="material-symbols-outlined text-base opacity-70 hover:opacity-100">close</button>
          </div>
        )}
      </div>

      {stale && (
        <div className="bg-warning-50 border border-warning-200 text-warning-800 rounded-lg p-3 flex items-center justify-between gap-2">
          <span>התצוגה לא עדכנית: מתנדב אחר פעל על הדיווח או שהמקור השתנה.</span>
          <button onClick={load} className="px-3 py-1 rounded-lg bg-warning-600 text-white text-sm">רענון</button>
        </div>
      )}

      <header className="glass rounded-xl p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl font-bold">{report.bookTitle} <span className="font-normal text-on-surface/60 text-lg">— {report.currentRef}</span></h2>
          <LabelChips labels={report.labels} />
        </div>
        <div className="text-xs text-on-surface/60 flex flex-wrap gap-x-4">
          <span>{report.kind === 'text_correction' ? 'הצעת תיקון' : 'דיווח חופשי'}</span>
          <span dir="ltr">{report.sourceFolder}</span>
          {Number.isSafeInteger(report.location?.lineIndex) && <span>שורה {report.location.lineIndex + 1} (לפי הדיווח)</span>}
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
          {(reportedPick || githubUrl) && (
            <div className="glass rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span>מיקום השורה לא אותר בוודאות.</span>
              {reportedPick && report.state === 'open' && (
                <button
                  type="button"
                  onClick={() => setSourcePick({ ...reportedPick, key: Date.now() })}
                  className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-medium flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-base">find_in_page</span>
                  הצגת שורה {reportedPick.lineIndex + 1} שדווחה, מהמקור
                </button>
              )}
              {githubUrl && (
                <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                  <span className="material-symbols-outlined text-base">open_in_new</span>
                  פתיחת הספר בגיטהאב{githubUrl.includes('#L') ? ' (סביב השורה שדווחה)' : ''}
                </a>
              )}
            </div>
          )}
          {source?.candidates?.length > 0 && (
            <section className="glass rounded-xl p-4">
              <h3 className="font-bold">מועמדים (התאמה לא ודאית — לבחירה ידנית בלבד)</h3>
              <p className="text-xs text-on-surface/60 mb-2">לחיצה על מועמד טוענת אותו ב&quot;בחירת מקור ידנית&quot;.</p>
              <ul className="text-sm space-y-1">
                {source.candidates.map((c, i) => {
                  const path = c.path || source.path
                  const lineIndex = Number.isInteger(c.lineIndex) ? c.lineIndex : null
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        disabled={!path}
                        onClick={() => setSourcePick({ path, lineIndex, key: Date.now() })}
                        className="w-full text-right whitespace-pre-wrap break-words rounded-lg px-2 py-1 hover:bg-info-50 disabled:hover:bg-transparent disabled:cursor-default cursor-pointer"
                      >
                        <span dir="ltr" className="text-xs text-on-surface/50 ml-2">{c.path}{lineIndex !== null ? `:${lineIndex + 1}` : ''}</span>{c.line}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <ReportActions detail={detail} meId={session?.user?.id} busy={busy} run={run} probe={probe} sourcePick={sourcePick} />
      <HistoryPanel detail={detail} />
    </div>
  )
}
