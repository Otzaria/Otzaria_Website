'use client'

import { useEffect, useState } from 'react'
import UnifiedDiff from '@/components/corrections/UnifiedDiff'

const btn = 'px-3 py-2 rounded-lg font-medium text-sm disabled:opacity-50 flex items-center gap-1'

/**
 * פעולות המתנדב על דיווח. כל שליחה נושאת את ה-generation שהוצג; השרת דוחה תצוגה ישנה.
 * @param {{detail:object, meId:string, busy:boolean, run:(body:object)=>Promise<boolean>}} props
 */
export default function ReportActions({ detail, meId, busy, run }) {
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
  const [manualPath, setManualPath] = useState('')
  const [manualLine, setManualLine] = useState('')
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (mode !== 'reassign' || handlers.length) return
    fetch('/api/corrections/handlers').then((r) => r.json()).then((b) => setHandlers(b.users || [])).catch(() => {})
  }, [mode, handlers.length])

  if (report.state !== 'open') return null
  const usable = source && (source.status === 'exact' || source.status === 'relocated')
  const baseLine = preview?.line ?? source?.currentLine ?? rev?.originalLine ?? ''
  // ה-diff של מה שיישמר בפועל: הקשר רק מיעד שנטען בוודאות (בחירה ידנית או מקור שאותר בדיוק).
  const editTarget = preview
    ? { context: preview.context ?? null, lineIndex: preview.lineIndex, path: preview.path }
    : usable ? { context: source.context ?? null, lineIndex: source.lineIndex, path: source.path } : { context: null, lineIndex: null, path: null }

  if (!claimedByMe) {
    return (
      <div className="glass rounded-xl p-4 flex flex-wrap items-center gap-3">
        {report.manual?.status === 'claimed' && new Date(report.manual.leaseExpiresAt) > new Date()
          ? <span className="text-sm">בטיפול של <b>{report.manual.assigneeName}</b> עד {new Date(report.manual.leaseExpiresAt).toLocaleString('he-IL')}</span>
          : <span className="text-sm">הדיווח אינו משויך למטפל.</span>}
        <button disabled={busy} onClick={() => run({ action: 'claim' })} className={`${btn} bg-primary text-on-primary`}>
          <span className="material-symbols-outlined text-base">back_hand</span> קח לטיפול
        </button>
      </div>
    )
  }

  const openEdit = () => {
    setNewLine(rev ? (rev.newLine ?? baseLine) : baseLine)
    setMode('edit')
  }

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="text-sm">בטיפולך עד {new Date(report.manual.leaseExpiresAt).toLocaleString('he-IL')}</div>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy || !usable || !rev || rev.newLine === null}
          title={!usable ? 'אי אפשר לאשר לפני שהמקור אותר בוודאות' : ''}
          onClick={() => run({ action: 'approve', generation: g, revision: report.currentRevision, seenBlobSha: source?.blobSha })}
          className={`${btn} bg-success-600 text-white hover:bg-success-700`}
        >
          <span className="material-symbols-outlined text-base">check</span> אישור
        </button>
        <button disabled={busy} onClick={openEdit} className={`${btn} glass`}><span className="material-symbols-outlined text-base">edit</span> עריכה ואז אישור</button>
        <button disabled={busy} onClick={() => setMode('reject')} className={`${btn} glass text-danger-700`}><span className="material-symbols-outlined text-base">block</span> דחייה</button>
        <button disabled={busy} onClick={() => setMode('reassign')} className={`${btn} glass`}><span className="material-symbols-outlined text-base">swap_horiz</span> העברה למטפל</button>
        <button disabled={busy} onClick={() => setMode('source')} className={`${btn} glass`}><span className="material-symbols-outlined text-base">find_in_page</span> בחירת מקור ידנית</button>
        {permissions.canVerify && rev && (
          <button disabled={busy} onClick={() => run({ action: 'resubmit', generation: g })} className={`${btn} glass`}><span className="material-symbols-outlined text-base">send</span> שליחה מחודשת לשירות</button>
        )}
        <button disabled={busy} onClick={() => setMode('close')} className={`${btn} glass`}><span className="material-symbols-outlined text-base">task_alt</span> סגירה ידנית</button>
        <button disabled={busy} onClick={() => run({ action: 'release', generation: g })} className={`${btn} glass`}><span className="material-symbols-outlined text-base">logout</span> שחרור</button>
      </div>

      {mode === 'edit' && (
        <div className="space-y-2">
          <p className="text-xs text-on-surface/60">עורכים את השורה המלאה כפי שתיכתב במקור. נוצרת גרסת הצעה חדשה; ההצעה המקורית נשמרת.</p>
          <textarea value={newLine} onChange={(e) => setNewLine(e.target.value)} rows={4} dir="rtl" className="w-full border rounded-lg p-2 font-mono text-base bg-white" />
          <div className="flex gap-2">
            <button
              disabled={busy || newLine === baseLine || /[\r\n]/.test(newLine)}
              onClick={async () => {
                const ok = await run({
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
          <button disabled={busy || reason.trim().length < 3} onClick={async () => { if (await run({ action: 'reject', generation: g, reason })) setMode(null) }} className={`${btn} bg-danger-600 text-white`}>דחייה סופית</button>
        </div>
      )}

      {mode === 'close' && (
        <div className="space-y-2">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="הערה (למשל: טופל מחוץ למערכת)" className="w-full border rounded-lg p-2 bg-white" />
          <button disabled={busy} onClick={async () => { if (await run({ action: 'close_manual', generation: g, note: reason })) setMode(null) }} className={`${btn} bg-primary text-on-primary`}>סגירה</button>
        </div>
      )}

      {mode === 'reassign' && (
        <div className="flex flex-wrap gap-2 items-center">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="border rounded-lg px-2 py-1 bg-white">
            <option value="">בחירת מטפל…</option>
            {handlers.filter((h) => h.id !== String(meId)).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <button disabled={busy || !target} onClick={async () => { if (await run({ action: 'reassign', generation: g, targetUserId: target })) setMode(null) }} className={`${btn} bg-primary text-on-primary`}>העברה</button>
        </div>
      )}

      {mode === 'source' && (
        <div className="space-y-2">
          <p className="text-xs text-on-surface/60">נתיב Git מלא במאגר (תחת &lt;תיקייה&gt;/ספרים/אוצריא/) ומספר שורה (1 = ראשונה). הבחירה מתועדת; האישור עצמו נעשה דרך &quot;עריכה ואז אישור&quot;.</p>
          <div className="flex flex-wrap gap-2">
            <input value={manualPath} onChange={(e) => setManualPath(e.target.value)} placeholder="ToratEmetToOtzaria/ספרים/אוצריא/…txt" className="flex-1 min-w-[18rem] border rounded-lg px-2 py-1 bg-white" />
            <input value={manualLine} onChange={(e) => setManualLine(e.target.value)} placeholder="שורה" inputMode="numeric" className="w-24 border rounded-lg px-2 py-1 bg-white" />
            <button
              disabled={busy || !manualPath || !(Number(manualLine) >= 1)}
              onClick={async () => {
                const res = await run({ action: 'preview_source', path: manualPath.trim(), lineIndex: Number(manualLine) - 1 }, { keep: true })
                if (res && res.line !== undefined) setPreview(res)
              }}
              className={`${btn} glass`}
            >
              טעינת השורה
            </button>
          </div>
          {preview && (
            <div className="rounded-lg border border-info-200 bg-white p-3 text-sm space-y-1">
              {preview.neighbors.map((n) => (
                <div key={n.lineIndex} className={`whitespace-pre-wrap break-words ${n.lineIndex === preview.lineIndex ? 'font-bold bg-info-50' : 'text-on-surface/60'}`}>
                  <span className="text-xs text-on-surface/40 ml-2">{n.lineIndex + 1}</span>{n.text}
                </div>
              ))}
              <button onClick={openEdit} className={`${btn} bg-primary text-on-primary mt-2`}>עריכת השורה הזו ואישור</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
