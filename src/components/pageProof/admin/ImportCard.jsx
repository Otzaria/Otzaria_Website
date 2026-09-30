'use client'

import { useEffect, useRef, useState } from 'react'
import {
  importSummaryParts,
  isGatewayTimeout,
  importSnapshot,
  finishedImport,
  importFinishedLine,
  importFileErrors,
  mergeImportResults,
  GATEWAY_POLL_MS,
  GATEWAY_WAIT_MS,
} from '@/lib/pageProof/importRules'

// ייבוא חבילות-עמודים: ZIP של תיקיית "חבילת-עמודים" (חבילה.json + עמוד-NNN.json
// + pages/) כפי שמפיקה תוכנת-הספר (book-cli export-pages). כמה קבצים יחד;
// ספר גדול — בכמה ZIP-ים (אותו gid מתמזג). עמוד שחזר מזיהוי-מחדש (גרסה חדשה)
// מחליף את העמוד שהמתין לו ונפתח למעבר שני.
//
// כל קובץ נשלח בבקשה משלו, אחד אחרי השני. בקובץ גדול השער של האתר מפסיק לחכות
// לתשובה (502/503/504) אבל השרת ממשיך לייבא — זה לא כישלון: בודקים ברשימת-הספרים
// כל 10 שניות (עד 10 דקות) אם תאריך-הייבוא של ספר התחדש מאז שהקובץ נשלח, ורק אז
// ממשיכים לקובץ הבא. לא התקבל אישור — עוצרים, בלי לשלוח את השאר.
// pollEvery / pollFor — רק לבדיקות (ברירת-המחדל: 10 שניות / 10 דקות).

const WAITING = 'הקובץ גדול, והשער של האתר הפסיק לחכות לתשובה — אבל השרת ממשיך לעבד אותו. בודק כל 10 שניות…'
const GAVE_UP =
  'לא התקבל אישור שהייבוא הסתיים. רעננו את הדף בעוד כמה דקות ובדקו את תאריך הייבוא בטבלה — אין צורך להעלות שוב לפני כן.'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// רשימת-הספרים של מסך-הניהול (null — לא התקבלה)
async function loadBooks() {
  const d = await fetch('/api/admin/page-proof')
    .then((r) => r.json())
    .catch(() => null)
  return d?.success && Array.isArray(d.books) ? d.books : null
}

export default function ImportCard({ onImported, pollEvery = GATEWAY_POLL_MS, pollFor = GATEWAY_WAIT_MS }) {
  const fileRef = useRef(null)
  const alive = useRef(true)
  const [pct, setPct] = useState(10)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  // {tone: 'wait'|'warn', text, rest?: שמות הקבצים שלא נשלחו}
  const [notice, setNotice] = useState(null)
  const [result, setResult] = useState(null)

  // יצאו מהמסך באמצע — לא ממשיכים לבדוק ולשלוח
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // השער הפסיק לחכות: בודקים עד שהייבוא מסתיים — הספר, או null (לא התקבל אישור)
  const waitForImport = async (before) => {
    if (!before) return null
    for (let waited = 0; waited < pollFor && alive.current; waited += pollEvery) {
      await sleep(pollEvery)
      const done = finishedImport(before, await loadBooks())
      if (done) return done
    }
    return null
  }

  const run = async () => {
    const files = [...(fileRef.current?.files || [])]
    if (!files.length) return
    setBusy(true)
    setResult(null)
    setNotice(null)
    const acc = { results: [], errors: [], finished: [] }
    const show = () => setResult({ results: mergeImportResults(acc.results), errors: [...acc.errors], finished: [...acc.finished] })
    try {
      for (let i = 0; i < files.length && alive.current; i++) {
        const file = files[i]
        setProgress(files.length > 1 ? `קובץ ${i + 1} מתוך ${files.length}` : null)
        const books = await loadBooks()
        const before = books ? importSnapshot(books) : null
        const fd = new FormData()
        fd.append('file', file)
        fd.append('doublePct', String(pct))
        let res
        try {
          res = await fetch('/api/admin/page-proof/import', { method: 'POST', body: fd })
        } catch (e) {
          acc.errors.push(`${file.name}: ${e.message}`)
          show()
          continue
        }
        if (isGatewayTimeout(res.status)) {
          setNotice({ tone: 'wait', text: WAITING })
          const done = await waitForImport(before)
          if (!done) {
            setNotice({ tone: 'warn', text: GAVE_UP, rest: files.slice(i + 1).map((f) => f.name) })
            break
          }
          setNotice(null)
          acc.finished.push(importFinishedLine(done))
          show()
          onImported?.()
          continue
        }
        const data = await res.json().catch(() => null)
        const got = Array.isArray(data?.results) ? data.results : []
        acc.results.push(...got)
        acc.errors.push(...importFileErrors(file.name, data, res.status))
        show()
        if (got.length) onImported?.()
      }
    } finally {
      setBusy(false)
      setProgress(null)
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
        ZIP של תיקיית חבילת-עמודים מתוכנת-הספר (חבילה.json, עמוד-NNN.json ו-pages/). אפשר כמה קבצים יחד, עד 150MB לקובץ. ייבוא-חוזר של אותו ספר מוסיף עמודים ואינו דורס עמודים שכבר הוגשו — חוץ מעמודים שממתינים לזיהוי-מחדש: גרסה חדשה שלהם מחליפה אותם ופותחת אותם למעבר שני. קובץ של יותר מ-~30 עמודים — עדיף לפצל לכמה קבצים (הם נשלחים אחד-אחד).
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
        {progress && (
          <span className="text-sm text-on-surface/70" data-testid="import-progress">
            {progress}
          </span>
        )}
      </div>
      {notice && (
        <div
          role="status"
          data-testid="import-notice"
          className={`mt-3 rounded px-2 py-1 text-sm ${notice.tone === 'warn' ? 'bg-warning-50 text-warning-800' : 'bg-info-50 text-info-800'}`}
        >
          {notice.text}
          {notice.rest?.length > 0 && <div className="mt-1">לא נשלחו: {notice.rest.join(', ')}</div>}
        </div>
      )}
      {result && (
        <div className="mt-3 space-y-1 text-sm">
          {result.finished.map((line, i) => (
            <div key={`${i}:${line}`} className="rounded bg-success-50 px-2 py-1 text-success-800" data-testid="import-finished">
              {line}
            </div>
          ))}
          {result.results.map((r) => (
            <div key={r.gid} className="rounded bg-success-50 px-2 py-1 text-success-800" data-testid="import-result">
              <b>{r.title}</b>: {importSummaryParts(r).join(' · ')}
              {r.errors?.length > 0 && <ul className="list-disc pr-5 text-danger-700">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
            </div>
          ))}
          {result.errors.length > 0 && (
            <ul className="list-disc rounded bg-danger-50 py-1 pr-6 text-danger-700">
              {result.errors.map((e, i) => (
                <li key={`${i}:${e}`}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
