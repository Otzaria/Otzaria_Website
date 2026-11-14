'use client'

import { useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { fullDateText } from '@/lib/adminTerms'
import { TRIAGE_STATE_LABELS, TRIAGE_VERDICT_LABELS } from '@/lib/adminAppReportsScreen/appReportsTerms'
import { loginHref, requestJson } from '@/components/admin/list/adminRequest'

const PUBLISH_FAILED = 'פתיחת הכרטיס נכשלה.'
const CONFIDENCE_LABELS = { high: 'ודאות גבוהה', medium: 'ודאות בינונית', low: 'ודאות נמוכה' }

/**
 * הבדיקה האוטומטית של תקיעה או קריסה: המצב, ההחלטה והפענוח, השאלות שנשלחו למדווח,
 * ו"פתח בכל זאת" (POST /api/app-reports/admin/[reportId]/publish) לדיווח שלא נפתח או שעוד ממתין.
 */
export default function TriageSection({ report, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const t = report.triage
  const canPublish = t.state === 'held' || t.state === 'pending'

  const publish = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const json = await requestJson(`/api/app-reports/admin/${encodeURIComponent(report.reportId)}/publish`, { method: 'POST', fallback: PUBLISH_FAILED })
      toast.show({ message: json.issueNumber ? `נפתח כרטיס #${json.issueNumber}` : 'הדיווח ייפתח בסנכרון הבא' })
      onChanged?.()
    } catch (err) {
      setError({ message: err?.status === 409 ? 'הדיווח כבר נפתח או השתנה. רענן את הדף.' : err?.message || PUBLISH_FAILED, sessionExpired: Boolean(err?.sessionExpired) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-body-md">
        <Badge tone={t.state === 'held' ? 'neutral' : 'info'}>{TRIAGE_STATE_LABELS[t.state] || t.state}</Badge>
        {t.verdict && <Badge>{TRIAGE_VERDICT_LABELS[t.verdict] || t.verdict}</Badge>}
        {t.confidence && <span className="text-body-sm text-on-surface-variant">{CONFIDENCE_LABELS[t.confidence] || t.confidence}</span>}
        {t.decidedAt && <span className="text-body-sm text-on-surface-variant">{fullDateText(t.decidedAt)}</span>}
      </p>
      {t.state === 'pending' && t.deadline && (
        <p className="text-body-sm text-on-surface-variant">אם לא תתקבל החלטה, הדיווח ייפתח אחרי {fullDateText(t.deadline)}.</p>
      )}
      {t.awaitingReply && <p className="text-body-sm text-on-surface-variant">ממתין לתשובת המדווח; תשובה תפעיל בדיקה חוזרת.</p>}
      {t.summary && <div dir="rtl" className="whitespace-pre-wrap break-words rounded-(--radius-shape) bg-surface-container-lowest p-3 text-body-md">{t.summary}</div>}
      {t.questions?.length > 0 && (
        <>
          <h3 className="text-title-sm text-on-surface">{t.questionsSentAt ? 'שאלות שנשלחו למדווח' : 'שאלות למדווח (לא נשלחו)'}</h3>
          <ol className="list-decimal ps-6 text-body-md">{t.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error.message}
          {error.sessionExpired && <> <a href={loginHref()} className="underline">התחבר</a></>}
        </p>
      )}
      {canPublish && (
        <div>
          <Button variant="outlined" size="sm" icon="open_in_new" softDisabled={busy} onClick={publish}>
            {busy ? 'פותח…' : 'פתח כרטיס בכל זאת'}
          </Button>
        </div>
      )}
    </div>
  )
}
