'use client'

import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import ActionError from '@/components/admin/list/ActionError'
import { cardKeyAction, decisionEdit, errorCardState, finalVersionLine } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { errorTextsProblem } from '@/lib/pageReports/rules'
import {
  appliedText, reportName,
} from '@/lib/adminPageReportsScreen/pageReportsTerms'
import { isTextEntry, moveCardFocus, useKeepCardFocus } from './cardFocus'
import ErrorTextCompare from './ErrorTextCompare'
import ErrorDecisionPanel from './ErrorDecisionPanel'
import PageImage from './PageImage'
import PageScanCrop from './PageScanCrop'
import ReportHeader from './ReportHeader'
import ResolutionLine from './ResolutionLine'

/** כרטיס הכרעה בדיווח: ההחלטה נשמרת בדיווח בלבד, והשינוי בטקסט נעשה בעורך. */
export default function BookErrorCard({ report, busy, error, onDecide, onFilterBook }) {
  const titleId = useId()
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState(/** @type {{ original: string, proposed: string } | null} */ (null))
  const state = errorCardState(report)
  const finalLine = finalVersionLine(report)
  const name = reportName(report)
  const cardRef = useKeepCardFocus(`${report.status}|${state.applied}`)

  const onKeyDown = (event) => {
    if (isTextEntry(event.target) || event.target.closest?.('[role="dialog"]')) return
    const action = cardKeyAction(event)
    if (!action) return
    const card = event.currentTarget
    if (action === 'next' || action === 'prev') {
      event.preventDefault()
      moveCardFocus(card, action === 'next' ? 1 : -1)
      return
    }
    if (!state.decide || busy) return
    event.preventDefault()
    // קיצור מקלדת להכרעה בדיווח בלבד.
    if (action === 'approve' && draft && errorTextsProblem(draft.original, draft.proposed)) return
    onDecide(report, action, { applyToText: false, note, edit: action === 'approve' ? decisionEdit(report, draft) : null })
  }

  const resolutionExtra = state.pending ? '' : (state.applied ? appliedText(report.appliedToText) : 'ההכרעה לא שינתה את טקסט העמוד. אם נדרש שינוי, יש לערוך אותו ידנית בעורך.')

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

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-3">
          <PageScanCrop imageUrl={report.imageUrl} cropRect={report.cropRect} alt={name} maxHeightRem={8} />
          <ErrorTextCompare original={report.original} proposed={report.proposed} contextBefore={report.contextBefore} contextAfter={report.contextAfter} />
          {report.message && (
            <p className="text-body-md text-on-surface [overflow-wrap:anywhere]">
              <span className="text-on-surface-variant">הערת המדווח: </span>{report.message}
            </p>
          )}
        </div>
        <PageImage src={report.imageUrl} name={name} />
      </div>

      {finalLine && (
        <p className="flex flex-wrap gap-x-2 text-body-md text-on-surface [overflow-wrap:anywhere]" dir="rtl">
          <span><span className="text-on-surface-variant">הוצע: </span>{finalLine.reported}</span>
          <span aria-hidden="true" className="text-on-surface-variant">·</span>
          <span><span className="text-on-surface-variant">הוחלט: </span><strong className="font-semibold">{finalLine.decided}</strong></span>
          {report.finalByName && <span className="text-body-sm text-on-surface-variant">(בנוסח של <bdi>{report.finalByName}</bdi>)</span>}
        </p>
      )}

      {!state.pending && <ResolutionLine resolution={report.resolution} extra={resolutionExtra} />}


      {state.decide && (
        <ErrorDecisionPanel report={report} name={name} busy={busy} note={note} onNoteChange={setNote}
          draft={draft} onDraftChange={setDraft}
          onDecide={(action, options) => onDecide(report, action, options)} />
      )}

      {!state.pending && state.reopen && (
        <div className="border-t border-outline-variant pt-3">
          <Button variant="text" size="sm" icon="undo" onClick={() => onDecide(report, 'reopen')} softDisabled={busy} aria-label={`פתח מחדש — ${name}`}>
            פתח מחדש
          </Button>
        </div>
      )}

      <ActionError error={error} />
    </Card>
  )
}
