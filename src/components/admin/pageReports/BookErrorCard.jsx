'use client'

import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Notice from '@/components/ui/Notice'
import ActionError from '@/components/admin/list/ActionError'
import { cardKeyAction, decisionEdit, errorCardState, finalVersionLine } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { errorTextsProblem } from '@/lib/pageReports/rules'
import {
  APPLY_BLOCKED_TEXT, MARKER_STALE_TEXT, NOT_APPLIED_TEXT, NOT_FOUND_TEXT, appliedText, applyLaterHint, reportName,
} from '@/lib/adminPageReportsScreen/pageReportsTerms'
import { isTextEntry, moveCardFocus, useKeepCardFocus } from './cardFocus'
import ErrorTextCompare from './ErrorTextCompare'
import ErrorDecisionPanel from './ErrorDecisionPanel'
import PageImage from './PageImage'
import PageScanCrop from './PageScanCrop'
import ReportHeader from './ReportHeader'
import ResolutionLine from './ResolutionLine'

/**
 * כרטיס "טעות בספר": המטרה — שיהיה קל להכריע אם הטעות נכונה.
 *   כותרת — ספר, עמוד (קישור לעורך), מצב הדיווח ומצב העמוד, מי דיווח ומתי.
 *   מיד מתחת — האזור המדווח מתוך הצילום (PageScanCrop, כשהעורך מיקם אותו), וההשוואה, הלב של הכרטיס: "בספר" מול "התיקון המוצע", כל צד במשפט ההקשר שלו, עם האותיות השונות מודגשות;
 *   מתחתיה הערת המדווח, ובצד — צילום העמוד (נפתח בהגדלה).
 *   ממתין: ErrorDecisionPanel — "אשר והשאר בסוגריים" / "אשר והחלף בתיקון" (מושבת עם הסבר כשאי אפשר), הערה, "דחה".
 *   הוכרע: מה הוחלט ומה נעשה בטקסט; "החל על הטקסט" כשאפשר, ו"פתח מחדש" רק אם עוד לא הוחל.
 * מקלדת (כשהפוקוס בכרטיס ולא בשדה טקסט): A — אשר והשאר בסוגריים, R — דחה, J / K או ↑ ↓ — כרטיס הבא / הקודם.
 *
 * @param {{ report: any, busy: boolean, error: any, notice?: 'not_found' | null,
 *   onDecide: (report: any, action: string, options?: { applyToText?: boolean, note?: string }) => void,
 *   onFilterBook?: (bookPath: string) => void }} props
 */
export default function BookErrorCard({ report, busy, error, notice = null, onDecide, onFilterBook }) {
  const titleId = useId()
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState(/** @type {{ original: string, proposed: string } | null} */ (null))
  const state = errorCardState(report)
  const finalLine = finalVersionLine(report)
  const name = reportName(report)
  const cardRef = useKeepCardFocus(`${report.status}|${state.applied}|${Boolean(report.markerStale)}`)

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
    // A — הדרך המקובלת (הסימון נשאר בסוגריים); החלפה בתיקון — רק בכפתור, בבחירה מפורשת
    if (action === 'approve' && draft && errorTextsProblem(draft.original, draft.proposed)) return
    onDecide(report, action, { applyToText: false, note, edit: action === 'approve' ? decisionEdit(report, draft) : null })
  }

  const resolutionExtra = state.pending ? '' : (state.applied ? appliedText(report.appliedToText) : (report.markerStale ? MARKER_STALE_TEXT : NOT_APPLIED_TEXT))

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

      {notice === 'not_found' && <Notice tone="warning" title="הטקסט לא השתנה">{NOT_FOUND_TEXT}</Notice>}

      {state.decide && (
        <ErrorDecisionPanel report={report} name={name} busy={busy} replaceChoice={state.replaceChoice} note={note} onNoteChange={setNote}
          draft={draft} onDraftChange={setDraft}
          onDecide={(action, options) => onDecide(report, action, options)} />
      )}

      {!state.pending && (state.applyLater || state.applyLaterBlockReason || state.reopen) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-outline-variant pt-3">
          {state.markerUpdate && (
            <Button variant="tonal" icon="sync" onClick={() => onDecide(report, 'apply', { applyMode: 'marker' })} softDisabled={busy}
              aria-label={`עדכן את הסימון בטקסט — ${name}`}>
              עדכן את הסימון בטקסט
            </Button>
          )}
          {state.applyLater && (
            <>
              <Button variant="tonal" icon="edit_note" onClick={() => onDecide(report, 'apply')} softDisabled={busy} aria-busy={busy || undefined}
                aria-label={`החל על הטקסט — ${name}`}>
                החל על הטקסט
              </Button>
              <span className="text-body-sm text-on-surface-variant">{applyLaterHint(report.status)}</span>
            </>
          )}
          {state.applyLaterBlockReason && (
            <span className="text-body-sm text-on-surface-variant">{APPLY_BLOCKED_TEXT[state.applyLaterBlockReason]}</span>
          )}
          {state.reopen && (
            <Button variant="text" size="sm" icon="undo" className="ms-auto" onClick={() => onDecide(report, 'reopen')} softDisabled={busy}
              aria-label={`פתח מחדש — ${name}`}>
              פתח מחדש
            </Button>
          )}
        </div>
      )}

      <ActionError error={error} />
    </Card>
  )
}
