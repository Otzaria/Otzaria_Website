'use client'

import { useEffect, useState } from 'react'
import Badge from '@/components/ui/Badge'
import RelativeTime from '@/components/ui/RelativeTime'
import { fetchMyPageReports } from './pageReportsApi'
import { reportStatusText } from './reportLogic'

/**
 * "הדיווחים שלי על העמוד" — רשימה מקופלת; נטענת רק כשפותחים אותה.
 * @param {{ bookPath: string, pageNumber: number, load?: typeof fetchMyPageReports }} props
 */
export default function MyPageReports({ bookPath, pageNumber, load = fetchMyPageReports }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="mt-5 rounded-(--radius-card) bg-surface px-4 py-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer py-1 text-title-sm text-on-surface">הדיווחים שלי על העמוד</summary>
      {open && <ReportsList bookPath={bookPath} pageNumber={pageNumber} load={load} />}
    </details>
  )
}

function ReportsList({ bookPath, pageNumber, load }) {
  const [state, setState] = useState({ status: 'loading', reports: [], error: '' })

  useEffect(() => {
    let alive = true
    load(bookPath, pageNumber)
      .then((reports) => { if (alive) setState({ status: 'ready', reports, error: '' }) })
      .catch((err) => { if (alive) setState({ status: 'error', reports: [], error: err?.message || 'טעינת הדיווחים נכשלה.' }) })
    return () => { alive = false }
  }, [bookPath, pageNumber, load])

  if (state.status === 'loading') return <p role="status" className="py-2 text-body-sm text-on-surface-variant">טוען…</p>
  if (state.status === 'error') return <p role="alert" className="py-2 text-body-sm text-error">{state.error}</p>
  if (state.reports.length === 0) return <p className="py-2 text-body-sm text-on-surface-variant">עוד לא שלחת דיווחים על העמוד הזה.</p>

  return (
    <ul className="divide-y divide-outline-variant pb-1">
      {state.reports.map((report) => <ReportRow key={report._id} report={report} />)}
    </ul>
  )
}

function ReportRow({ report }) {
  const status = reportStatusText(report.status)
  const isError = report.kind === 'book_error'
  return (
    <li className="flex items-start gap-3 py-2 text-body-sm">
      <div className="min-w-0 flex-1">
        <p className="line-clamp-3 break-words text-on-surface">
          {isError
            ? <><span className="text-on-surface-variant">טעות בספר: </span>{report.original} ← {report.proposed}</>
            : <><span className="text-on-surface-variant">הודעה: </span>{report.message}</>}
        </p>
        {isError && report.finalProposed != null && (
          <p className="break-words text-on-surface"><span className="text-on-surface-variant">הוחלט: </span>{report.finalOriginal} ← {report.finalProposed}</p>
        )}
        {report.resolution?.note && <p className="text-on-surface-variant">תשובת המנהל: {report.resolution.note}</p>}
        <p className="text-label-sm text-on-surface-variant"><RelativeTime date={report.createdAt} /></p>
      </div>
      <Badge tone={status.tone}>{status.label}</Badge>
    </li>
  )
}
