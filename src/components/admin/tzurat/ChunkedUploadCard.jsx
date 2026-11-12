'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Ltr from '@/components/ui/Ltr'
import ProgressBar from '@/components/ui/ProgressBar'
import { apiCall } from './adminApi'
import CheckRow from '@/components/ui/CheckRow'
import CardSection from '@/components/ui/CardSection'
import UploadJobInfo from './UploadJobInfo'
import { pollUpload, uploadFile } from './chunkedUpload'
import { POLL_MS, findResume, formatBytes, isTerminal, percent, resumeKey } from './uploadPlan'

// העלאת חבילות של צורת הדף (ZIP למסכת, עד ~2GB לקובץ): כל קובץ נשלח בחלקים (PUT לכל חלק, עם 3
// ניסיונות), אחר כך "סיום" — והשרת מעבד ברקע; הכרטיס בודק כל 5 שניות ומציג עמודים/החלטות/תמונות,
// ובסוף הסיכום והשגיאות. העלאה שנקטעה (רשת, רענון הדף, "עצירה") — בבחירה חוזרת של אותו קובץ מוצע
// "המשך העלאה", ונשלחים רק החלקים שחסרים בשרת. עיבוד שנכשל — "נסה שוב" (בלי להעלות שוב).
// פוקוס: הכפתורים "כבויים" ב-softDisabled (לא disabled), כדי שהפוקוס לא ייזרק לגוף הדף; אחרי "עצור" (שנעלם) —
// לכפתור "העלה". קלט הקובץ עצמו נסתר ומחוץ לסדר ה-Tab — "בחר קבצים" הוא הנקודה הנגישה.
// onBusy(true/false) — העלאה רצה (המעטפת שואלת לפני מעבר לשונית או יציאה, כי היציאה עוצרת אותה).
// sleep / pollEvery — רק לבדיקות.

const LABEL = 'קובצי ZIP של צורת הדף'

export default function ChunkedUploadCard({ onChanged, onBusy, sleep, pollEvery = POLL_MS }) {
  const inputId = useId()
  const fileRef = useRef(null)
  const uploadRef = useRef(null)
  const stopFocus = useRef(false)
  const alive = useRef(true)
  const stop = useRef(false)
  // [{key, file, resumeId, resume, phase, sent, total, uploadId, upload, error}]
  // phase: ready | uploading | stopped | error | processing | done | failed
  const [entries, setEntries] = useState([])
  const [busy, setBusy] = useState(false)
  const [retrying, setRetrying] = useState(null) // key של הקובץ ש"נסה שוב" שלו בדרך

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    onBusy?.(busy)
  }, [busy, onBusy])

  const patch = (key, p) => setEntries((cur) => cur.map((e) => (e.key === key ? { ...e, ...(typeof p === 'function' ? p(e) : p) } : e)))

  const onPick = () => {
    const files = [...(fileRef.current?.files || [])]
    setEntries(
      files.map((file) => {
        const resumeId = findResume(file)
        return { key: resumeKey(file), file, resumeId, resume: !!resumeId, phase: 'ready', sent: 0, total: file.size, uploadId: null, upload: null, error: null }
      })
    )
  }

  // מעקב אחרי העיבוד ברקע (לא חוסם את הקובץ הבא)
  const follow = (key, id) => {
    pollUpload(id, {
      alive: () => alive.current,
      every: pollEvery,
      sleep,
      onUpdate: (u) => {
        if (!alive.current) return
        patch(key, { upload: u, phase: isTerminal(u.status) ? u.status : 'processing' })
        if (isTerminal(u.status)) onChanged?.()
      },
    })
  }

  const runOne = async (entry, resumeId) => {
    patch(entry.key, { phase: 'uploading', error: null })
    const r = await uploadFile(entry.file, {
      resumeId: resumeId || null,
      sleep,
      shouldStop: () => stop.current || !alive.current,
      onProgress: ({ id, sent, total }) => alive.current && patch(entry.key, { uploadId: id, sent, total }),
    })
    if (!alive.current) return r
    if (!r.ok) {
      patch(entry.key, { phase: r.stopped ? 'stopped' : 'error', error: r.error, uploadId: r.id || null })
      return r
    }
    const id = r.upload?.id
    patch(entry.key, (e) => ({ phase: isTerminal(r.upload?.status) ? r.upload.status : 'processing', upload: r.upload, uploadId: id, sent: e.total }))
    onChanged?.()
    if (id && !isTerminal(r.upload?.status)) follow(entry.key, id)
    return r
  }

  // ההעלאה הסתיימה (או נעצרה) — אם "עצור" נלחץ, הפוקוס עובר ל"העלה" (כי "עצור" נעלם)
  const finish = () => {
    if (!alive.current) return
    setBusy(false)
    if (stopFocus.current) {
      stopFocus.current = false
      requestAnimationFrame(() => uploadRef.current?.focus())
    }
  }

  const runAll = async () => {
    if (busy || !entries.some((e) => e.phase === 'ready')) return
    stop.current = false
    setBusy(true)
    try {
      for (const e of entries) {
        if (!alive.current || stop.current) break
        if (e.phase !== 'ready') continue
        await runOne(e, e.resume ? e.resumeId : null)
      }
    } finally {
      finish()
    }
  }

  const resumeEntry = async (e) => {
    if (busy) return
    stop.current = false
    setBusy(true)
    try {
      await runOne(e, e.uploadId || e.resumeId)
    } finally {
      finish()
    }
  }

  const retry = async (e) => {
    const id = e.upload?.id || e.uploadId
    if (!id || retrying) return
    setRetrying(e.key)
    const r = await apiCall(`uploads/${encodeURIComponent(id)}/retry`, { method: 'POST', body: {} })
    if (!alive.current) return
    setRetrying(null)
    if (!r.ok) {
      patch(e.key, { error: r.error })
      return
    }
    patch(e.key, (cur) => ({ phase: 'processing', error: null, upload: r.data?.upload || { ...cur.upload, status: 'queued', errors: [] } }))
    follow(e.key, id)
  }

  const totalBytes = entries.reduce((s, e) => s + (e.total || 0), 0)
  const sentBytes = entries.reduce((s, e) => s + (e.sent || 0), 0)
  const ready = entries.some((e) => e.phase === 'ready')

  return (
    <CardSection
      title="העלאת חבילות"
      testId="upload-card"
      description={(
        <>
          קובץ ZIP אחד לכל מסכת, כמו שצורת הדף מפיקה אותו. אפשר כמה קבצים יחד, עד כ-2GB לקובץ. אם החיבור נקטע או שהדף
          נסגר — בוחרים שוב את אותו קובץ, ו&quot;המשך העלאה&quot; ישלח רק את מה שחסר. העלאה חוזרת של אותה מסכת מעדכנת אותה,
          ולא דורסת תשובות שכבר ניתנו.
        </>
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} id={inputId} type="file" accept=".zip" multiple disabled={busy} onChange={onPick} className="sr-only" aria-label={LABEL}
          tabIndex={-1} aria-hidden="true" />
        <Button variant="outlined" icon="folder_open" softDisabled={busy} onClick={() => fileRef.current?.click()} aria-label={`${entries.length ? 'בחר קבצים אחרים' : 'בחר קבצים'} (${LABEL})`}>
          {entries.length ? 'בחר קבצים אחרים' : 'בחר קבצים'}
        </Button>
        <Button ref={uploadRef} icon="upload" onClick={runAll} softDisabled={!ready || busy} aria-busy={busy || undefined}>
          {busy ? 'מעלה…' : 'העלה'}
        </Button>
        {busy && (
          <Button variant="text" icon="pause_circle" onClick={() => {
            stop.current = true
            stopFocus.current = true
          }}>
            עצור
          </Button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col gap-4">
          {entries.length > 1 && (
            <div className="flex flex-col gap-1 text-body-sm" data-testid="upload-overall">
              <div className="flex justify-between text-on-surface-variant">
                <span>סך הכול</span>
                <Ltr className="tabular-nums">{formatBytes(sentBytes)} / {formatBytes(totalBytes)}</Ltr>
              </div>
              <ProgressBar value={percent(sentBytes, totalBytes)} max={100} label="התקדמות כוללת" />
            </div>
          )}
          <ul className="flex flex-col gap-4">
            {entries.map((e) => (
              <li key={e.key} className="flex flex-col gap-2 text-body-sm" data-testid="upload-entry">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Ltr className="min-w-0 break-all text-title-sm text-on-surface">{e.file.name}</Ltr>
                  <Ltr className="tabular-nums text-on-surface-variant">{formatBytes(e.sent)} / {formatBytes(e.total)}</Ltr>
                  <span className="flex-1" />
                  {(e.phase === 'stopped' || e.phase === 'error') && e.uploadId && (
                    <Button variant="outlined" size="sm" icon="upload" onClick={() => resumeEntry(e)} disabled={busy}>
                      המשך העלאה
                    </Button>
                  )}
                  {e.phase === 'failed' && (
                    <Button variant="outlined" size="sm" icon="restart_alt" onClick={() => retry(e)} disabled={busy} loading={retrying === e.key}>
                      נסה שוב
                    </Button>
                  )}
                </div>
                {e.phase === 'ready' && e.resumeId && (
                  <CheckRow checked={e.resume} onChange={(checked) => patch(e.key, { resume: checked })} disabled={busy}>
                    המשך העלאה (נמצאה העלאה קודמת של הקובץ)
                  </CheckRow>
                )}
                <ProgressBar value={percent(e.sent, e.total)} max={100} label={`התקדמות ${e.file.name}`} />
                {e.phase === 'uploading' && <p className="text-on-surface-variant">שולח… ({percent(e.sent, e.total)}%)</p>}
                {e.phase === 'stopped' && <p className="text-on-surface-variant">ההעלאה נעצרה — אפשר להמשיך מאותה נקודה.</p>}
                {e.error && <p role="alert" className="text-error">{e.error}</p>}
                <UploadJobInfo upload={e.upload} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardSection>
  )
}
