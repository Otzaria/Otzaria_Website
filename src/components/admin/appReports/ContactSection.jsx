'use client'

import { useId, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Notice from '@/components/ui/Notice'
import { useToast } from '@/components/ui/Toast'
import { FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { fullDateText } from '@/lib/adminTerms'
import { CONTACT_FAILED, contactErrorText, unsavedAttachmentsText } from '@/lib/adminAppReportsScreen/appReportsTerms'
import { AdminApiError, loginHref, requestJson } from '@/components/admin/list/adminRequest'
import { ReportImages } from './ReportFiles'

function InboundIssueStatus({ entry: c }) {
  if (c.issueComment === 'posted' && c.issueCommentUrl) {
    return (
      <a href={c.issueCommentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-body-sm text-primary hover:underline">
        <AppIcon name="open_in_new" className="text-icon-sm" />
        פורסם כתגובה בכרטיס ב-GitHub
      </a>
    )
  }
  if (c.issueComment === 'triage') return <p className="text-body-sm text-on-surface-variant">הדיווח לא נפתח: התשובה הועברה לבדיקה האוטומטית, ותתווסף לכרטיס אם ייפתח.</p>
  if (c.issueComment === 'held') return <p className="text-body-sm text-on-surface-variant">נשלח מכתובת אחרת מזו שבדיווח — לא פורסם בכרטיס.</p>
  return <p className="text-body-sm text-on-surface-variant">התשובה תתווסף לכרטיס ב-GitHub בסנכרון הבא</p>
}

// out = הודעה של הצוות; in = תשובת המדווח שנקלטה מהמייל (src/lib/app-reports/inbound.js)
function ContactEntry({ entry: c, index, reportId }) {
  const incoming = c.direction === 'in'
  return (
    <li className={`flex flex-col gap-1 rounded-(--radius-shape) p-3 text-body-md ${incoming ? 'bg-info-container text-on-info-container' : 'bg-surface-container'}`}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm">
        {incoming ? <span className="inline-flex items-center gap-1"><AppIcon name="reply" className="text-icon-sm" />תשובת המדווח</span> : <span>{c.byName}</span>}
        {c.sentAt && <span>{fullDateText(c.sentAt)}</span>}
        {incoming && c.fromEmail && <bdi dir="ltr">{c.fromEmail}</bdi>}
        {incoming && c.attachments > 0 && <span>{unsavedAttachmentsText(c.attachments, c.images?.length > 0)}</span>}
      </p>
      {c.subject && <p className="text-title-sm">{c.subject}</p>}
      <p className="whitespace-pre-wrap break-words">{c.message}</p>
      {c.images?.length > 0 && (
        <ReportImages title="תמונות" images={c.images}
          urlFor={(i) => `/api/app-reports/admin/${encodeURIComponent(reportId)}/contact-images/${index}/${i}`} />
      )}
      {incoming && <InboundIssueStatus entry={c} />}
    </li>
  )
}

/**
 * "שלח הודעה למדווח": ההתכתבות (הודעות הצוות ותשובות המדווח), וטופס נושא + תוכן כשהמדווח השאיר מייל.
 * אותה בקשה כמו קודם: POST /api/app-reports/[reportId]/contact { subject, message } → { entry }. דרך requestJson:
 * הפניה לדף ההתחברות / 401 — "פג תוקף" עם קישור "התחבר"; 429 / 403 / שבת / שגיאה באנגלית — הודעה בעברית.
 * הכפתור "כבוי" ב-softDisabled (בזמן השליחה — "שולח…", וכשחסר נושא או תוכן), כך שהפוקוס לא נופל לגוף הדף גם
 * כשהשדות מתרוקנים אחרי השליחה; בזמן השליחה השדות לקריאה בלבד, ושליחה שנייה נחסמת.
 */
export default function ContactSection({ report }) {
  const toast = useToast()
  const ids = { subject: useId(), message: useId() }
  const [log, setLog] = useState(report.contactLog || [])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const send = async (e) => {
    e.preventDefault()
    if (sending || !subject.trim() || !message.trim()) return
    setSending(true)
    setError(null)
    try {
      const json = await requestJson(`/api/app-reports/${encodeURIComponent(report.reportId)}/contact`, {
        method: 'POST',
        body: { subject, message },
        fallback: CONTACT_FAILED,
      })
      if (!json.success) throw new AdminApiError(CONTACT_FAILED, 200)
      setLog((l) => [...l, json.entry])
      setSubject('')
      setMessage('')
      toast.show({ message: 'ההודעה נשלחה למדווח' })
    } catch (err) {
      setError({
        // 429 — ההודעה המיוחדת; השאר — ההודעה (בעברית) שכבר הוכנה ב-requestJson
        message: err?.status === 429 ? contactErrorText(429) : err?.message || CONTACT_FAILED,
        sessionExpired: Boolean(err?.sessionExpired),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {log.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="ההתכתבות עם המדווח">
          {log.map((c, i) => <ContactEntry key={i} entry={c} index={i} reportId={report.reportId} />)}
        </ul>
      )}
      {report.emailDomainSuggestion && (
        <Notice tone="warning" title="ייתכן שהמייל לא יגיע">
          נראה שיש טעות הקלדה בכתובת המייל של המדווח (אולי התכוון ל-<bdi dir="ltr">@{report.emailDomainSuggestion}</bdi>?).
        </Notice>
      )}
      {report.hasEmail ? (
        <form onSubmit={send} className="flex flex-col gap-4">
          <p className="text-body-sm text-on-surface-variant">ההודעה תישלח למייל שהמדווח השאיר, ותשובה שלו תופיע כאן.</p>
          <div>
            <label htmlFor={ids.subject} className={FIELD_LABEL}>נושא</label>
            <input id={ids.subject} className={fieldClasses({ className: 'w-full' })} maxLength={200} value={subject} readOnly={sending} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label htmlFor={ids.message} className={FIELD_LABEL}>ההודעה</label>
            <textarea id={ids.message} className={fieldClasses({ kind: 'textarea', className: 'min-h-36 w-full' })} maxLength={5000} value={message} readOnly={sending}
              onChange={(e) => setMessage(e.target.value)} required />
          </div>
          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error.message}
              {error.sessionExpired && <> <a href={loginHref()} className="underline">התחבר</a></>}
            </p>
          )}
          <div>
            <Button type="submit" variant="filled" size="sm" icon="send" softDisabled={sending || !subject.trim() || !message.trim()}>
              {sending ? 'שולח…' : 'שלח הודעה'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-body-md text-on-surface-variant">המדווח לא השאיר כתובת מייל.</p>
      )}
    </div>
  )
}
