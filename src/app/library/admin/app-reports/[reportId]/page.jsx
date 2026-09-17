'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import { TYPE_LABELS, TRIGGER_LABELS, IssueStateBadge, formatDateTime, formatBytes } from '../shared'

export default function AppReportDetailPage() {
  const { reportId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/app-reports/admin/${encodeURIComponent(reportId)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !json?.success) setError(res.status === 404 ? 'הדיווח לא נמצא' : (json?.error || 'טעינת הדיווח נכשלה'))
        else setData(json)
      })
      .catch(() => { if (!cancelled) setError('טעינת הדיווח נכשלה') })
    return () => { cancelled = true }
  }, [reportId])

  if (error) return <div className="glass rounded-2xl p-6 text-danger-600">{error}</div>
  if (!data) return <div className="flex justify-center py-12"><LoadingSpinner /></div>

  const r = data.report
  const fileUrl = (kind) => `/api/app-reports/admin/${encodeURIComponent(r.reportId)}/files/${kind}`

  return (
    <div className="space-y-6">
      <Link href="/library/admin/app-reports" className="inline-flex items-center gap-1 text-primary hover:underline">
        <span className="material-symbols-outlined">arrow_forward</span>
        חזרה לרשימה
      </Link>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-on-surface">{r.title}</h2>
          <span className="rounded-full bg-info-100 px-3 py-1 text-xs font-bold text-info-800">{TYPE_LABELS[r.type] || r.type}</span>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-bold text-on-surface/60">{TRIGGER_LABELS[r.trigger] || r.trigger}</span>
          <IssueStateBadge report={r} />
        </div>

        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
          <Field label="מזהה"><span dir="ltr" className="font-mono">{r.reportId}</span></Field>
          <Field label="התקבל">{formatDateTime(r.createdAt)}</Field>
          <Field label="גרסה"><span dir="ltr">{r.appVersion}</span></Field>
          <Field label="מערכת הפעלה"><span dir="ltr">{[r.platform, r.osVersion, r.arch].filter(Boolean).join(' · ')}</span></Field>
          {r.clientCreatedAt && <Field label="נוצר אצל המשתמש">{formatDateTime(r.clientCreatedAt)}</Field>}
          {r.sentryEventId && <Field label="Sentry"><span dir="ltr" className="font-mono">{r.sentryEventId}</span></Field>}
          {data.canSeeEmail && (
            <Field label="מייל המדווח">{r.reporterEmail ? <span dir="ltr">{r.reporterEmail}</span> : 'לא השאיר'}</Field>
          )}
          {!data.canSeeEmail && <Field label="מייל המדווח">{r.hasEmail ? 'השאיר (מוסתר)' : 'לא השאיר'}</Field>}
          {r.previousIssueNumber && <Field label="issue קודם"><span dir="ltr">#{r.previousIssueNumber}</span></Field>}
          {r.issuePending && r.issueError && <Field label="שגיאת GitHub אחרונה"><span dir="ltr" className="text-danger-600">{r.issueError}</span></Field>}
        </dl>

        <Section title="תיאור">{r.description || <span className="text-on-surface/50">ללא תיאור</span>}</Section>
        {r.stepsToReproduce && <Section title="שלבים לשחזור">{r.stepsToReproduce}</Section>}
        {r.signature?.exceptionType && (
          <div>
            <h3 className="font-bold mb-2">חתימה</h3>
            <pre dir="ltr" className="bg-surface rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap">
              {[r.signature.exceptionType, ...(r.signature.frames || [])].join('\n')}
            </pre>
          </div>
        )}
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <h3 className="text-xl font-bold">קבצים</h3>
        <div className="flex flex-wrap gap-3">
          {r.files?.diagnostics && (
            <a href={fileUrl('diagnostics')} className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-variant rounded-lg">
              <span className="material-symbols-outlined">download</span>
              diagnostics.json ({formatBytes(r.files.diagnostics.size)})
            </a>
          )}
          {r.files?.errors && (
            <a href={fileUrl('errors')} className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-variant rounded-lg">
              <span className="material-symbols-outlined">download</span>
              errors.txt ({formatBytes(r.files.errors.size)})
            </a>
          )}
          {!r.files?.diagnostics && !r.files?.errors && <span className="text-on-surface/50">לא צורפו קבצים</span>}
        </div>
        {r.files?.diagnostics && <DiagnosticsViewer url={fileUrl('diagnostics')} />}
      </div>

      {data.related.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-xl font-bold mb-3">דיווחים נוספים באותו issue ({data.related.length})</h3>
          <ul className="space-y-2 text-sm">
            {data.related.map((x) => (
              <li key={x.reportId} className="flex flex-wrap gap-3">
                <Link href={`/library/admin/app-reports/${encodeURIComponent(x.reportId)}`} className="text-primary hover:underline">{x.title}</Link>
                <span dir="ltr" className="text-on-surface/60">{x.appVersion} · {x.platform}</span>
                <span className="text-on-surface/60">{formatDateTime(x.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ContactPanel report={r} />
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="flex gap-2">
      <dt className="text-on-surface/60 shrink-0">{label}:</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="font-bold mb-2">{title}</h3>
      <p className="whitespace-pre-wrap leading-relaxed">{children}</p>
    </div>
  )
}

function DiagnosticsViewer({ url }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && !text) {
      try {
        const res = await fetch(url)
        const raw = await res.text()
        try { setText(JSON.stringify(JSON.parse(raw), null, 2)) } catch { setText(raw) }
      } catch {
        setText('טעינת האבחון נכשלה')
      }
    }
  }

  return (
    <div>
      <button onClick={toggle} className="flex items-center gap-1 text-primary hover:underline">
        <span className="material-symbols-outlined">{open ? 'expand_less' : 'expand_more'}</span>
        {open ? 'הסתר אבחון' : 'הצג אבחון'}
      </button>
      {open && (
        <pre dir="ltr" className="mt-3 max-h-[600px] overflow-auto bg-surface rounded-lg p-3 text-xs text-left">
          {text || 'טוען...'}
        </pre>
      )}
    </div>
  )
}

function ContactPanel({ report }) {
  const { showAlert } = useDialog()
  const [log, setLog] = useState(report.contactLog || [])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const send = async (e) => {
    e.preventDefault()
    setSending(true)
    try {
      const res = await fetch(`/api/app-reports/${encodeURIComponent(report.reportId)}/contact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        showAlert('שגיאה', res.status === 429 ? 'נשלחו יותר מדי פניות על דיווח זה. נסה שוב מאוחר יותר.' : (json?.error || 'שליחת המייל נכשלה'))
        return
      }
      setLog((l) => [...l, json.entry])
      setSubject('')
      setMessage('')
      showAlert('נשלח', 'המייל נשלח למדווח')
    } catch {
      showAlert('שגיאה', 'שליחת המייל נכשלה')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      <h3 className="text-xl font-bold">יצירת קשר עם המדווח</h3>
      {log.length > 0 && (
        <ul className="space-y-3">
          {log.map((c, i) => (
            <li key={i} className="bg-surface rounded-lg p-3 text-sm">
              <div className="flex flex-wrap gap-3 text-on-surface/60 mb-1">
                <span>{c.byName}</span>
                <span>{formatDateTime(c.sentAt)}</span>
              </div>
              <div className="font-bold">{c.subject}</div>
              <p className="whitespace-pre-wrap">{c.message}</p>
            </li>
          ))}
        </ul>
      )}
      {report.hasEmail ? (
        <form onSubmit={send} className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2"
            placeholder="נושא"
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
          />
          <textarea
            className="w-full border rounded-lg px-3 py-2 min-h-[140px]"
            placeholder="תוכן ההודעה"
            maxLength={5000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={sending || !subject.trim() || !message.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg disabled:opacity-50"
          >
            <span className="material-symbols-outlined">send</span>
            {sending ? 'שולח...' : 'שליחה'}
          </button>
        </form>
      ) : (
        <p className="text-on-surface/50">המדווח לא השאיר כתובת מייל.</p>
      )}
    </div>
  )
}
