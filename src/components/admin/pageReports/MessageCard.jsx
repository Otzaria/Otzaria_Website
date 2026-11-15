'use client'

import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import ActionError from '@/components/admin/list/ActionError'
import { cardKeyAction, messageCardState } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { reportName } from '@/lib/adminPageReportsScreen/pageReportsTerms'
import { isTextEntry, moveCardFocus, useKeepCardFocus } from './cardFocus'
import NoteField from './NoteField'
import ReportHeader from './ReportHeader'
import ResolutionLine from './ResolutionLine'

/**
 * כרטיס "הודעה על עמוד": ספר, עמוד (קישור לעורך), מי כתב ומתי, וההודעה עצמה. ממתינה — הערה ו"סמן כטופל";
 * טופלה — מי טיפל ומתי, ו"פתח מחדש". מקלדת: J / K או ↑ ↓ — כרטיס הבא / הקודם (אין כאן אישור ודחייה).
 * @param {{ report: any, busy: boolean, error: any, onDecide: (report: any, action: string, options?: { note?: string }) => void,
 *   onFilterBook?: (bookPath: string) => void }} props
 */
export default function MessageCard({ report, busy, error, onDecide, onFilterBook }) {
  const titleId = useId()
  const [note, setNote] = useState('')
  const state = messageCardState(report)
  const name = reportName(report)
  const cardRef = useKeepCardFocus(report.status)

  const onKeyDown = (event) => {
    const action = cardKeyAction(event)
    if (action !== 'next' && action !== 'prev') return
    if (isTextEntry(event.target) || event.target.closest?.('[role="dialog"]')) return
    event.preventDefault()
    moveCardFocus(event.currentTarget, action === 'next' ? 1 : -1)
  }

  return (
    <Card
      as="li"
      ref={cardRef}
      data-report-card={report._id}
      tabIndex={-1}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-col gap-3 p-3 outline-none focus-visible:outline-2 focus-visible:outline-primary sm:p-4"
    >
      <ReportHeader report={report} titleId={titleId} onFilterBook={onFilterBook} />
      <p className="whitespace-pre-wrap text-body-lg text-on-surface [overflow-wrap:anywhere]">{report.message}</p>

      {!state.handle && <ResolutionLine resolution={report.resolution} />}

      {state.handle && (
        <div className="flex flex-wrap items-end gap-3 border-t border-outline-variant pt-3">
          <div className="min-w-0 flex-1 basis-56"><NoteField value={note} onChange={setNote} context={name} disabled={busy} /></div>
          <Button variant="filled" icon="check" onClick={() => onDecide(report, 'handled', { note })} softDisabled={busy} aria-busy={busy || undefined}
            aria-label={`סמן כטופל — ${name}`}>
            סמן כטופל
          </Button>
        </div>
      )}
      {state.reopen && (
        <div className="flex justify-end">
          <Button variant="text" size="sm" icon="undo" onClick={() => onDecide(report, 'reopen')} softDisabled={busy} aria-label={`פתח מחדש — ${name}`}>
            פתח מחדש
          </Button>
        </div>
      )}
      <ActionError error={error} />
    </Card>
  )
}
