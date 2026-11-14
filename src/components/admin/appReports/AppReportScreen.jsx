'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import ErrorState from '@/components/ui/ErrorState'
import Skeleton from '@/components/ui/Skeleton'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import LoadError from '@/components/admin/list/LoadError'
import { requestJson } from '@/components/admin/list/adminRequest'
import { fullDateText } from '@/lib/adminTerms'
import { productLabel, systemText, triggerLabel, typeLabel } from '@/lib/adminAppReportsScreen/appReportsTerms'
import ContactSection from './ContactSection'
import IssueBadge from './IssueBadge'
import ReportFiles from './ReportFiles'
import TriageSection from './TriageSection'
import { reportHref } from './ReportRow'

const LIST_HREF = '/library/admin/app-reports'
const LOAD_FAILED = 'לא הצלחנו לטעון את הדיווח.'

function Section({ title, children }) {
  return (
    <section className={cardClasses({ padding: 'md', className: 'flex min-w-0 flex-col gap-3' })} aria-label={title}>
      <h2 className="text-title-md text-on-surface">{title}</h2>
      {children}
    </section>
  )
}

function Fact({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label-md text-on-surface-variant">{label}</dt>
      <dd className="min-w-0 break-words text-body-md">{children}</dd>
    </div>
  )
}

/** הפרטים הטכניים — בעמודה בצד במסך רחב */
function Facts({ report: r, canSeeEmail }) {
  return (
    <dl className="flex flex-col gap-3">
      <Fact label="התקבל">{fullDateText(r.createdAt)}</Fact>
      {r.clientCreatedAt && <Fact label="נוצר אצל המשתמש">{fullDateText(r.clientCreatedAt)}</Fact>}
      <Fact label="גרסה"><bdi dir="ltr">{r.appVersion}</bdi></Fact>
      <Fact label="מערכת הפעלה"><bdi dir="ltr">{systemText(r)}</bdi></Fact>
      <Fact label="מייל המדווח">
        {canSeeEmail
          ? (r.reporterEmail ? <bdi dir="ltr">{r.reporterEmail}</bdi> : 'לא השאיר')
          : (r.hasEmail ? 'השאיר (מוסתר)' : 'לא השאיר')}
      </Fact>
      {r.previousIssueNumber && <Fact label="כרטיס קודם ב-GitHub"><bdi dir="ltr">#{r.previousIssueNumber}</bdi></Fact>}
      {r.issuePending && r.issueError && <Fact label="שגיאת GitHub אחרונה"><bdi dir="ltr" className="text-error">{r.issueError}</bdi></Fact>}
      {r.sentryEventId && <Fact label="מזהה ב-Sentry"><bdi dir="ltr" className="font-mono text-body-sm">{r.sentryEventId}</bdi></Fact>}
      <Fact label="מזהה הדיווח"><bdi dir="ltr" className="font-mono text-body-sm">{r.reportId}</bdi></Fact>
    </dl>
  )
}

/**
 * עמוד דיווח תקלה (/library/admin/app-reports/[reportId]) בתבנית "עמוד פרטים": פירור לחם, כותרת ותגים (מוצר, סוג,
 * מקור, כרטיס ב-GitHub), ובעמודה הראשית — תיאור, קבצים, דיווחים נוספים באותו כרטיס ו"שלח הודעה למדווח"; הפרטים
 * הטכניים בעמודה בצד (≥lg). אותה בקשה כמו קודם: GET /api/app-reports/admin/[reportId] → { report, related, canSeeEmail }.
 * הבקשה דרך requestJson (התחברות שפגה → "התחבר"; שבת ושגיאת שרת — בעברית). page.jsx נותן key={reportId}, כך שמעבר
 * לדיווח אחר מתחיל ממצב נקי (בלי הדיווח או השגיאה הקודמים).
 */
export default function AppReportScreen({ reportId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    requestJson(`/api/app-reports/admin/${encodeURIComponent(reportId)}`, { fallback: LOAD_FAILED })
      .then((json) => { if (!cancelled) setData(json) })
      .catch((err) => { if (!cancelled) setError(err) })
    return () => { cancelled = true }
  }, [reportId, reloadKey])

  const retry = () => { setError(null); setData(null); setReloadKey((k) => k + 1) }

  const back = (
    <nav aria-label="פירור לחם">
      <Button href={LIST_HREF} variant="text" size="sm" icon="arrow_forward">דיווחי תקלות</Button>
    </nav>
  )

  if (error) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        {error.status === 404
          ? <ErrorState icon="search_off" title="הדיווח לא נמצא" description="ייתכן שהקישור שגוי או שהדיווח נמחק." />
          : <LoadError error={error} title={LOAD_FAILED} onRetry={retry} />}
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true" aria-label="טוען">
        {back}
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 rounded-(--card-radius)" />
      </div>
    )
  }

  const r = data.report
  return (
    <div className="flex flex-col gap-5">
      {back}
      <AdminScreenHeader
        title={r.title}
        description={(
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{productLabel(r)}</Badge>
            <Badge tone="info">{typeLabel(r)}</Badge>
            <Badge>{triggerLabel(r)}</Badge>
            <IssueBadge report={r} />
          </span>
        )}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="תיאור">
            <p className="whitespace-pre-wrap break-words text-body-md">{r.description || <span className="text-on-surface-variant">בלי תיאור</span>}</p>
            {r.stepsToReproduce && (
              <>
                <h3 className="text-title-sm text-on-surface">איך לשחזר</h3>
                <p className="whitespace-pre-wrap break-words text-body-md">{r.stepsToReproduce}</p>
              </>
            )}
            {r.signature?.exceptionType && (
              <>
                <h3 className="text-title-sm text-on-surface">חתימת השגיאה</h3>
                <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap rounded-(--radius-shape) bg-surface-container-lowest p-3 text-body-sm">
                  {[r.signature.exceptionType, ...(r.signature.frames || [])].join('\n')}
                </pre>
              </>
            )}
          </Section>
          {r.triage && <Section title="בדיקה אוטומטית"><TriageSection report={r} onChanged={retry} /></Section>}
          <Section title="קבצים"><ReportFiles report={r} /></Section>
          {data.related.length > 0 && (
            <Section title={`דיווחים נוספים באותו כרטיס (${data.related.length})`}>
              <ul className="flex flex-col gap-2 text-body-md">
                {data.related.map((x) => (
                  <li key={x.reportId} className="flex flex-wrap items-baseline gap-x-3">
                    <Link href={reportHref(x.reportId)} className="text-primary underline-offset-2 hover:underline">{x.title}</Link>
                    <span className="text-body-sm text-on-surface-variant"><bdi dir="ltr">{x.appVersion} · {x.platform}</bdi> · {fullDateText(x.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="שלח הודעה למדווח"><ContactSection report={r} /></Section>
        </div>
        <aside className={cardClasses({ padding: 'md' })} aria-label="פרטי הדיווח">
          <Facts report={r} canSeeEmail={data.canSeeEmail} />
        </aside>
      </div>
    </div>
  )
}
