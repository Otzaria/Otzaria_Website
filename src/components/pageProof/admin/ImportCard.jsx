'use client'

import { useRef, useState } from 'react'
import { importSummaryParts } from '@/lib/pageProof/importRules'

// ייבוא חבילות-עמודים: ZIP של תיקיית "חבילת-עמודים" (חבילה.json + עמוד-NNN.json
// + pages/) כפי שמפיקה תוכנת-הספר (book-cli export-pages). כמה קבצים יחד;
// ספר גדול — בכמה ZIP-ים (אותו gid מתמזג). עמוד שחזר מזיהוי-מחדש (גרסה חדשה)
// מחליף את העמוד שהמתין לו ונפתח למעבר שני.

export default function ImportCard({ onImported }) {
  const fileRef = useRef(null)
  const [pct, setPct] = useState(10)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const run = async () => {
    const files = [...(fileRef.current?.files || [])]
    if (!files.length) return
    setBusy(true)
    setResult(null)
    try {
      const fd = new FormData()
      files.forEach((f) => fd.append('file', f))
      fd.append('doublePct', String(pct))
      const res = await fetch('/api/admin/page-proof/import', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({ success: false, errors: [`שגיאת שרת (${res.status})`] }))
      setResult(data)
      if (data.results?.length) onImported?.()
    } catch (e) {
      setResult({ success: false, errors: [e.message] })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="glass-strong rounded-xl p-4">
      <h3 className="mb-2 flex items-center gap-2 font-bold text-on-surface">
        <span className="material-symbols-outlined text-primary">upload_file</span>
        ייבוא חבילת-עמודים
      </h3>
      <p className="mb-3 text-sm text-on-surface/60">
        ZIP של תיקיית חבילת-עמודים מתוכנת-הספר (חבילה.json, עמוד-NNN.json ו-pages/). אפשר כמה קבצים יחד, עד 150MB לקובץ. ייבוא-חוזר של אותו ספר מוסיף עמודים ואינו דורס עמודים שכבר הוגשו — חוץ מעמודים שממתינים לזיהוי-מחדש: גרסה חדשה שלהם מחליפה אותם ופותחת אותם למעבר שני.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".zip" multiple disabled={busy} className="text-sm" aria-label="קובצי ZIP לייבוא" />
        <label className="flex items-center gap-2 text-sm" title="נקבע בייבוא הראשון של הספר">
          רצפים כפולים (%):
          <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className="w-16 rounded border border-surface-variant bg-surface px-2 py-1" />
        </label>
        <button onClick={run} disabled={busy} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-on-primary hover:opacity-90 disabled:opacity-40">
          <span className="material-symbols-outlined text-base">{busy ? 'hourglass_top' : 'cloud_upload'}</span>
          {busy ? 'מייבא… (המרת תמונות לוקחת זמן)' : 'ייבא'}
        </button>
      </div>
      {result && (
        <div className="mt-3 space-y-1 text-sm">
          {(result.results || []).map((r) => (
            <div key={r.gid} className="rounded bg-success-50 px-2 py-1 text-success-800" data-testid="import-result">
              <b>{r.title}</b>: {importSummaryParts(r).join(' · ')}
              {r.errors?.length > 0 && <ul className="list-disc pr-5 text-danger-700">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
            </div>
          ))}
          {(result.errors || []).length > 0 && (
            <ul className="list-disc rounded bg-danger-50 py-1 pr-6 text-danger-700">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
