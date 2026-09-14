'use client'

import { useState } from 'react'

const STATUS = { awaiting_external: 'ממתין לטיפול חיצוני', resolved: 'טופל', rejected: 'נדחה', returned_to_manual: 'הוחזר לטיפול ידני' }

/** טיפול חיצוני בספרי ספריא: חבילת האיתור + מעברים ידניים (מנהל בלבד). אין שליחה אוטומטית. */
export default function ExternalPanel({ detail, onDone }) {
  const { report, permissions } = detail
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const pkg = report.external?.package

  const go = async (action) => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/corrections/admin/external/${report.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, generation: report.generation, note }),
      })
      const b = await res.json()
      if (!res.ok) setMsg(b.error === 'stale_view' ? 'התצוגה לא עדכנית — רעננו.' : b.error === 'reason_required' ? 'חובה לציין סיבה.' : b.error || 'שגיאה')
      else await onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="glass rounded-xl p-4 space-y-3 border border-info-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">טיפול חיצוני — מחולל ספרי ספריא</h3>
        <span className="text-sm">{STATUS[report.external?.status] || '—'}</span>
      </div>
      <p className="text-xs text-on-surface/60">
        ספרי ספריא נבנים מארכיון SefariaExport ולא מקבצי המאגר, ולכן אין פרסום ל-GitHub. השורה המקורית היא הנוסח ב-DB אחרי ניקוי הגנרטור ואינה בהכרח זהה לגולמי. פורמט הקובץ למחולל טרם נקבע.
      </p>
      {pkg && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-on-surface/60">מיקום (לא יציב)</dt><dd>{pkg.he_ref}</dd>
          <dt className="text-on-surface/60">אינדקס שורה ב-DB</dt><dd>{pkg.db_line_index ?? '—'}</dd>
          <dt className="text-on-surface/60">גרסת ספרייה</dt><dd>{pkg.library_version ?? '—'}</dd>
          <dt className="text-on-surface/60">sha256 של השורה</dt><dd dir="ltr" className="break-all text-xs">{pkg.original_line_sha256 ?? '—'}</dd>
        </dl>
      )}
      {report.state === 'awaiting_external' && permissions.canManage && (
        <div className="space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="הערה / סיבה" className="w-full border rounded-lg p-2 bg-white" />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => go('resolve')} className="px-3 py-2 rounded-lg bg-success-600 text-white text-sm">סימון כטופל</button>
            <button disabled={busy} onClick={() => go('reject')} className="px-3 py-2 rounded-lg bg-danger-600 text-white text-sm">דחייה</button>
            <button disabled={busy} onClick={() => go('return_to_manual')} className="px-3 py-2 rounded-lg glass text-sm">החזרה לטיפול ידני</button>
          </div>
          {msg && <p className="text-sm text-danger-700">{msg}</p>}
        </div>
      )}
    </section>
  )
}
