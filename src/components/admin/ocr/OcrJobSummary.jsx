import Badge from '@/components/ui/Badge'
import OcrStatusBadge from './OcrStatusBadge'
import { cancelReasonLabel, formatDateTime, jobErrorText, salvageLabel, summaryParts } from './ocrJobView'

/**
 * סיכום עבודת OCR מקומי שהסתיימה (completed / failed / cancelled): מצב, ספירות הקליטה
 * (הוחלו · נכשלו · התנגשויות · עמודים שנמחקו), סיבת ביטול/כשל ושגיאות עמוד.
 * "בוטל" נקבע רק לפי status — לא לפי cancelReason.
 *
 * @param {{ job: any }} props
 */
export default function OcrJobSummary({ job }) {
  const parts = summaryParts(job)
  const hasCounts = job.status !== 'cancelled' && parts.some((p) => p.value > 0)
  const pageErrors = Array.isArray(job.pageErrors) ? job.pageErrors : []
  const finished = formatDateTime(job.finishedAt)
  const salvage = salvageLabel(job)

  return (
    <section aria-label="סיכום העבודה האחרונה" className="space-y-3 rounded-control border border-outline-variant p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-on-surface">העבודה האחרונה (מחשב מקומי)</h4>
        <OcrStatusBadge status={job.status} size="sm" />
      </div>

      {job.status === 'completed' && (
        <p className="text-sm text-on-surface">
          {job.resultOutcome === 'partial' ? 'העיבוד הסתיים חלקית, והתוצאות נקלטו.' : 'העיבוד הסתיים, והתוצאות נקלטו.'}
        </p>
      )}
      {job.status === 'failed' && (
        <p className="whitespace-pre-wrap break-words text-sm text-on-surface">
          העבודה נכשלה: {jobErrorText(job)}
        </p>
      )}
      {job.status === 'cancelled' && (
        <p className="text-sm text-on-surface">{cancelReasonLabel(job)}.</p>
      )}

      {salvage && <p className="text-sm text-on-surface">{salvage}.</p>}

      {hasCounts && (
        <ul className="flex flex-wrap gap-2" aria-label="ספירות הקליטה">
          {parts.map((p) => (
            <li key={p.key}>
              <Badge tone={p.value > 0 ? p.tone : 'neutral'}>
                {p.label}: {p.value}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {pageErrors.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-on-surface-variant">שגיאות בעמודים ({pageErrors.length})</summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto scrollbar-thin">
            {pageErrors.map((e, i) => (
              <li key={`${e.pageNumber}-${i}`} className="break-words text-on-surface-variant">
                עמוד {e.pageNumber}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {finished && <p className="text-xs text-on-surface-variant">הסתיימה ב-{finished}</p>}
      {job.pipelineVersion && (
        <p className="break-words text-xs text-on-surface-variant">
          גרסת עיבוד: <span dir="ltr" className="font-mono">{job.pipelineVersion}</span>
        </p>
      )}
    </section>
  )
}
