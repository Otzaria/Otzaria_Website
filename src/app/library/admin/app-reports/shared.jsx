'use client'

export const TYPE_LABELS = { bug: 'תקלה', crash: 'קריסה', performance: 'ביצועים', suggestion: 'הצעה' }
export const TRIGGER_LABELS = { manual: 'ידני', crash_prompt: 'אחרי קריסה', auto_crash: 'אוטומטי' }

// דיווח ביצועים שלא נשלח ידנית הוא תקיעה, לא קריסה
export function triggerLabel(report) {
  if (report.trigger === 'crash_prompt' && report.type === 'performance') return 'אחרי תקיעה'
  return TRIGGER_LABELS[report.trigger] || report.trigger
}

const CLOSE_REASON_LABELS = { completed: 'טופל', not_planned: 'לא יטופל', duplicate: 'כפול' }

export function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatBytes(size) {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  return `${(size / 1024).toFixed(1)} KB`
}

export function IssueStateBadge({ report }) {
  if (report.issuePending && !report.issueNumber) {
    return <span className="rounded-full bg-warning-100 px-3 py-1 text-xs font-bold text-warning-800" title={report.issueError || ''}>ממתין</span>
  }
  if (!report.issueNumber) return null
  const closed = report.issueState === 'closed'
  const reason = closed && CLOSE_REASON_LABELS[report.issueStateReason]
  return (
    <a href={report.issueUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
      <span dir="ltr" className="text-primary hover:underline">#{report.issueNumber}</span>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${closed ? 'bg-feature-100 text-feature-800' : 'bg-success-100 text-success-800'}`}>
        {closed ? `סגור${reason ? ` (${reason})` : ''}` : 'פתוח'}
      </span>
    </a>
  )
}
