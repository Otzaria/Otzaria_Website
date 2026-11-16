import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import RelativeTime from '@/components/ui/RelativeTime'
import { editorHref } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { PAGE_STATUS_LABELS, STATUS_LABELS, pageLabel } from '@/lib/adminPageReportsScreen/pageReportsTerms'

const STATUS_TONES = { pending: 'warning', approved: 'success', rejected: 'error', handled: 'success' }
const PAGE_STATUS_TONES = { 'in-progress': 'info', completed: 'success', available: 'neutral' }

/**
 * הכותרת של כרטיס דיווח (טעות או הודעה): שם הספר, העמוד (קישור לעורך), מצב הדיווח ומצב העמוד; מתחת — מי דיווח ומתי.
 * onFilterBook — "רק הספר הזה" (כשעוד לא מסונן לפי ספר).
 * @param {{ report: any, titleId: string, onFilterBook?: (bookPath: string) => void }} props
 */
export default function ReportHeader({ report, titleId, onFilterBook }) {
  const bookName = report.bookName || report.bookPath || 'ספר לא ידוע'
  const pageStatus = PAGE_STATUS_LABELS[report.pageStatus]
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      {/* בסיס 16rem: בנייד הכפתורים יורדים לשורה משלהם, במקום שהכותרת תידחס לעמודה צרה */}
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <h3 id={titleId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-title-md text-on-surface">
          <span className="min-w-0 max-w-full [overflow-wrap:anywhere]">{bookName}</span>
          <span className="text-on-surface-variant">·</span>
          <span>{pageLabel(report.pageNumber)}</span>
          <Badge tone={STATUS_TONES[report.status] || 'neutral'}>{STATUS_LABELS[report.status] || report.status}</Badge>
        </h3>
        <p className="flex flex-wrap items-center gap-x-1 text-body-sm text-on-surface-variant">
          <bdi className="min-w-0 max-w-full [overflow-wrap:anywhere]">{report.userName || 'משתמש לא ידוע'}</bdi>
          {report.createdAt && <><span aria-hidden="true">·</span><RelativeTime date={report.createdAt} prefix="דיווח" /></>}
          {pageStatus && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                מצב העמוד:
                <Badge tone={PAGE_STATUS_TONES[report.pageStatus] || 'neutral'}>{pageStatus}</Badge>
              </span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {onFilterBook && report.bookPath && (
          <Button variant="text" size="sm" icon="filter_list" onClick={() => onFilterBook(report.bookPath)} aria-label={`הצג רק דיווחים על ${bookName}`}>
            רק הספר הזה
          </Button>
        )}
        {/* טעות בספר — העורך נפתח מסומן על הסימון שבטקסט (?report=); קריאה בלבד, בלי שינוי בטקסט */}
        <Button variant="outlined" size="sm" iconEnd="open_in_new"
          href={editorHref(report.bookPath, report.pageNumber, report.kind === 'book_error' ? report._id : null)} external
          aria-label={`פתח את ${pageLabel(report.pageNumber)} ב${bookName} בעורך${report.kind === 'book_error' ? ', על הסימון בטקסט' : ''} (בלשונית חדשה)`}>
          פתח בעורך
        </Button>
      </div>
    </div>
  )
}
