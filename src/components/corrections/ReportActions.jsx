'use client'

import { useEffect, useRef, useState } from 'react'
import UnifiedDiff from '@/components/corrections/UnifiedDiff'
import ManualSourcePicker from '@/components/corrections/ManualSourcePicker'

const btn = 'px-3 py-2 rounded-lg font-medium text-sm disabled:opacity-50 flex items-center gap-1'
const PUBLISHING = new Set(['ready', 'in_progress', 'unknown_needs_reconcile', 'pr_opened'])
// הערות סגירה נפוצות — בלחיצה, בלי להקליד כל פעם
const CLOSE_NOTES = ['טופל מחוץ למערכת', 'כבר תוקן במקור', 'כפילות של דיווח אחר']

// מצבים סגורים שאפשר לפתוח מחדש (תואם REOPENABLE_STATES בשרת); דיווח שפורסם — לא.
const REOPENABLE = new Set(['closed_rejected', 'closed_manual', 'closed_already_fixed'])

/** דיווח סגור: פתיחה מחדש מחזירה אותו לתור הידני. */
function ReopenPanel({ report, busy, run }) {
  if (!REOPENABLE.has(report.state)) return null
  return (
    <div className="glass rounded-xl p-4 flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm">הדיווח סגור. פתיחה מחדש תחזיר אותו לתור הטיפול.</span>
      <button disabled={busy} onClick={() => run({ action: 'reopen', generation: report.generation })} className={`${btn} glass`}>
        <span className="material-symbols-outlined text-base">undo</span> פתיחה מחדש
      </button>
    </div>
  )
}

/**
 * פעולות המתנדב על דיווח. כל שליחה נושאת את ה-generation שהוצג; השרת דוחה תצוגה ישנה.
 * @param {{detail:object, meId:string, busy:boolean, run:(body:object, opts?:object)=>Promise<any>,
 *          probe?:(body:object)=>Promise<{ok:boolean, data:object}>, sourcePick?:{path:string, lineIndex:(number|null), key:number}|null}} props
 *   sourcePick — מועמד שנבחר ברשימת המועמדים: פותח את "בחירת מקור ידנית" עם הנתיב והשורה שלו.
 */
export default function ReportActions({ detail, meId, busy, run, probe, sourcePick = null }) {
  const { report, source, permissions } = detail
  const g = report.generation
  const rev = report.proposals.find((p) => p.revision === report.currentRevision) || null
  const claimedByMe = report.manual?.status === 'claimed' && String(report.manual.assignee) === String(meId)
    && new Date(report.manual.leaseExpiresAt) > new Date()
  const [mode, setMode] = useState(null)
  const [newLine, setNewLine] = useState('')
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState('')
  const [handlers, setHandlers] = useState([])
  const [preview, setPreview] = useState(null)
  const [activePick, setActivePick] = useState(null)
  const [seenPick, setSeenPick] = useState(null)
  const box = useRef(null)
  const closeNote = useRef(null)

  // מועמד חדש שנבחר בדף פותח את בחירת המקור הידנית (עדכון בזמן רינדור, לא ב-effect)
  if (sourcePick !== seenPick) {
    setSeenPick(sourcePick)
    if (sourcePick) {
      setActivePick(sourcePick)
      setMode('source')
    }
  }

  useEffect(() => {
    if (mode !== 'reassign' || handlers.length) return
    fetch('/api/corrections/handlers').then((r) => r.json()).then((b) => setHandlers(b.users || [])).catch(() => {})
  }, [mode, handlers.length])

  useEffect(() => {
    if (sourcePick) box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [sourcePick])

  if (report.state !== 'open') return <ReopenPanel report={report} busy={busy} run={run} />

  const usable = source && (source.status === 'exact' || source.status === 'relocated')
  const baseLine = preview?.line ?? source?.currentLine ?? rev?.originalLine ?? ''
  // ה-diff של מה שיישמר בפועל: הקשר רק מיעד שנטען בוודאות (בחירה ידנית או מקור שאותר בדיוק).
  const editTarget = preview
    ? { context: preview.context ?? null, lineIndex: preview.lineIndex, path: preview.path }
    : usable ? { context: source.context ?? null, lineIndex: source.lineIndex, path: source.path } : { context: null, lineIndex: null, path: null }

  // אושר וממתין לפרסום / בפרסום / PR פתוח: אין לקיחה ואין פעולות — רק דחייה (שסוגרת את ה-PR).
  const pub = report.publish?.status
  if (PUBLISHING.has(pub)) {
    const writing = pub === 'in_progress' || pub === 'unknown_needs_reconcile'
    const pr = pub === 'pr_opened' && report.publish?.prUrl
    return (
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="text-sm flex flex-wrap items-center gap-x-2">
          <span className="material-symbols-outlined text-base text-success-700">verified</span>
          <span>
            הדיווח אושר{report.approval?.byName ? <> ע&quot;י <b>{report.approval.byName}</b></> : null}
            {pr
              ? <> ונפתח עבורו <a href={report.publish.prUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">PR #{report.publish.prNumber}</a>. הוא ייסגר אוטומטית כשה-PR ימוזג.</>
              : writing ? ' והפרסום ל-GitHub מתבצע כעת.' : ' וממתין לפרסום.'}
          </span>
        </div>
        <p className="text-xs text-on-surface/70">אי אפשר לקחת לטיפול דיווח שאושר — זה יוצר PR כפול. אם האישור שגוי, אפשר לדחות אותו.</p>
        {writing ? (
          <p className="text-xs text-warning-800">הפרסום מתבצע כרגע; הדחייה תתאפשר כשיסתיים.</p>
        ) : mode !== 'reject' ? (
          <button disabled={busy} onClick={() => setMode('reject')} className={`${btn} glass text-danger-700`}>
            <span className="material-symbols-outlined text-base">block</span> דחייה
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-danger-700 font-medium">
              {pr ? `הדחייה תסגור את PR #${report.publish.prNumber} ב-GitHub בלי למזג אותו, ותסגור את הדיווח.` : 'הדחייה תבטל את הפרסום המתוכנן ותסגור את הדיווח.'}
            </p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="סיבת הדחייה (חובה)" className="w-full border rounded-lg p-2 bg-white" />
            <div className="flex gap-2">
              <button
                disabled={busy || reason.trim().length < 3}
                onClick={async () => { if (await run({ action: 'reject_approved', generation: g, reason })) setMode(null) }}
                className={`${btn} bg-danger-600 text-white`}
              >
                {pr ? 'דחייה וסגירת ה-PR' : 'דחייה סופית'}
              </button>
              <button onClick={() => setMode(null)} className={`${btn} glass`}>ביטול</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // שיוך שפג נשאר במסמך (הפקיעה אינה נכתבת), ולכן מוצג במפורש — אחרת היומן נראה סותר.
  const claimed = report.manual?.status === 'claimed'
  const leaseEnd = claimed ? new Date(report.manual.leaseExpiresAt) : null
  const leaseText = leaseEnd?.toLocaleString('he-IL')
  if (claimed && !claimedByMe && leaseEnd > new Date()) {
    return (
      <div className="glass rounded-xl p-4 text-sm">בטיפול של <b>{report.manual.assigneeName}</b> עד {leaseText}</div>
    )
  }

  // אין צורך ב"קח לטיפול" נפרד: פעולה על דיווח שאינו משויך לוקחת אותו קודם, ואז מבצעת.
  const act = async (body) => {
    if (claimedByMe) return run(body)
    const c = await run({ action: 'claim' }, { keep: true })
    if (!c) return false
    return run({ ...body, generation: c.generation }, { reloadOnFail: true })
  }

  const closeManual = async () => {
    if (await act({ action: 'close_manual', generation: g, note: reason })) setMode(null)
  }

  const openEdit = () => {
    setNewLine(rev ? (rev.newLine ?? baseLine) : baseLine)
    setMode('edit')
  }

  // בלי הסבר, אישור כבוי נראה כתקלה. דיווח חופשי מתוקן דרך 'עריכה ואז אישור'.
  const approveBlocked = !rev || rev.newLine === null
    ? 'דיווח חופשי — אין הצעת תיקון לאשר. לתיקון: "עריכה ואז אישור".'
    : !usable ? 'המקור לא אותר בוודאות — אפשר לבחור אותו ב"בחירת מקור ידנית".' : null

  return (
    <div ref={box} className="glass rounded-xl p-4 space-y-3">
      <div className="text-sm">
        {claimedByMe
          ? <>בטיפולך עד {leaseText}</>
          : <>{claimed ? <>הטיפול של <b>{report.manual.assigneeName}</b> פג ב-{leaseText}. </> : 'הדיווח אינו משויך למטפל. '}<span className="text-on-surface/60">כל פעולה תשייך אותו אליך.</span></>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy || Boolean(approveBlocked)}
          title={approveBlocked || ''}
          onClick={() => act({ action: 'approve', generation: g, revision: report.currentRevision, seenBlobSha: source?.blobSha })}
          className={`${btn} bg-success-600 text-white hover:bg-success-700`}
        >
          <span className="material-symbols-outlined text-base">check</span> אישור
        </button>
        <button disabled={busy} onClick={openEdit} className={`${btn} glass`}><span className="material-symbols-outlined text-base">edit</span> עריכה ואז אישור</button>
        <button disabled={busy} onClick={() => setMode('reject')} className={`${btn} glass text-danger-700`}><span className="material-symbols-outlined text-base">block</span> דחייה</button>
        <button disabled={busy} onClick={() => setMode('reassign')} className={`${btn} glass`}><span className="material-symbols-outlined text-base">swap_horiz</span> העברה למטפל</button>
        <button disabled={busy} onClick={() => { setActivePick(null); setMode('source') }} className={`${btn} glass`}><span className="material-symbols-outlined text-base">find_in_page</span> בחירת מקור ידנית</button>
        {permissions.canVerify && rev && (
          <button disabled={busy} onClick={() => act({ action: 'resubmit', generation: g })} className={`${btn} glass`}><span className="material-symbols-outlined text-base">send</span> שליחה מחודשת לשירות</button>
        )}
        <button disabled={busy} onClick={() => setMode('close')} className={`${btn} glass`}><span className="material-symbols-outlined text-base">task_alt</span> סגירה ידנית</button>
        {claimedByMe && <button disabled={busy} onClick={() => run({ action: 'release', generation: g })} className={`${btn} glass`}><span className="material-symbols-outlined text-base">logout</span> שחרור</button>}
      </div>
      {approveBlocked && <p className="text-xs text-on-surface/70">{approveBlocked}</p>}

      {mode === 'edit' && (
        <div className="space-y-2">
          <p className="text-xs text-on-surface/60">עורכים את השורה המלאה כפי שתיכתב במקור. נוצרת גרסת הצעה חדשה; ההצעה המקורית נשמרת.</p>
          <textarea value={newLine} onChange={(e) => setNewLine(e.target.value)} rows={4} dir="rtl" className="w-full border rounded-lg p-2 font-mono text-base bg-white" />
          <div className="flex gap-2">
            <button
              disabled={busy || newLine === baseLine || /[\r\n]/.test(newLine)}
              onClick={async () => {
                const ok = await act({
                  action: 'edit_approve', generation: g, revision: report.currentRevision, baseLine, newLine,
                  targetPath: preview ? preview.path : null, targetLineIndex: preview ? preview.lineIndex : undefined,
                  seenBlobSha: preview ? preview.blobSha : source?.blobSha,
                })
                if (ok) setMode(null)
              }}
              className={`${btn} bg-success-600 text-white`}
            >
              אישור הנוסח הערוך
            </button>
            <button onClick={() => setMode(null)} className={`${btn} glass`}>ביטול</button>
          </div>
          {/[\r\n]/.test(newLine) && <p className="text-xs text-danger-700">שורה אחת בלבד — פיצול שורות הוא שינוי מבני שאינו נתמך כאן.</p>}
          {newLine !== baseLine && !/[\r\n]/.test(newLine) && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-on-surface/70">כך ייראה השינוי שיישמר</p>
              <UnifiedDiff
                before={baseLine}
                after={newLine}
                {...editTarget}
                contextNote="המקור לא אותר בוודאות, ולכן אין הקשר מהקובץ — מוצגת רק השורה."
              />
            </div>
          )}
        </div>
      )}

      {mode === 'reject' && (
        <div className="space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="סיבת הדחייה (חובה)" className="w-full border rounded-lg p-2 bg-white" />
          <button disabled={busy || reason.trim().length < 3} onClick={async () => { if (await act({ action: 'reject', generation: g, reason })) setMode(null) }} className={`${btn} bg-danger-600 text-white`}>דחייה סופית</button>
        </div>
      )}

      {mode === 'close' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {CLOSE_NOTES.map((n) => (
              <button key={n} type="button" onClick={() => { setReason(n); closeNote.current?.focus() }} aria-pressed={reason === n} className={`px-2 py-1 rounded-full text-xs ${reason === n ? 'bg-primary text-on-primary' : 'glass hover:bg-surface-variant'}`}>{n}</button>
            ))}
          </div>
          {/* אנטר = סגירה; Shift+Enter = שורה חדשה בהערה */}
          <textarea
            ref={closeNote}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
              e.preventDefault()
              if (!busy) closeManual()
            }}
            rows={2}
            placeholder="הערה (למשל: טופל מחוץ למערכת)"
            className="w-full border rounded-lg p-2 bg-white"
          />
          <button disabled={busy} onClick={closeManual} className={`${btn} bg-primary text-on-primary`}>סגירה</button>
        </div>
      )}

      {mode === 'reassign' && (
        <div className="flex flex-wrap gap-2 items-center">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="border rounded-lg px-2 py-1 bg-white">
            <option value="">בחירת מטפל…</option>
            {handlers.filter((h) => h.id !== String(meId)).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <button disabled={busy || !target} onClick={async () => { if (await (permissions.canManage ? run : act)({ action: 'reassign', generation: g, targetUserId: target })) setMode(null) }} className={`${btn} bg-primary text-on-primary`}>העברה</button>
        </div>
      )}

      {mode === 'source' && (
        <ManualSourcePicker key={activePick?.key ?? 'manual'} busy={busy} run={run} probe={probe} pick={activePick} knownPath={source?.path ?? null} preview={preview} onPreview={setPreview} onEdit={openEdit} />
      )}
    </div>
  )
}
