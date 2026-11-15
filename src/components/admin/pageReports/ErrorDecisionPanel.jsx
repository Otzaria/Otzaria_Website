'use client'

import { useId } from 'react'
import Button from '@/components/ui/Button'
import { decisionEdit } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { errorTextsProblem } from '@/lib/pageReports/rules'
import EditVersionFields from './EditVersionFields'
import NoteField from './NoteField'

// ההחלטה נשמרת בדיווח בלבד. עריכת העמוד מתבצעת ידנית בעורך.
export default function ErrorDecisionPanel({ report, name, busy, onDecide, note, onNoteChange, draft, onDraftChange }) {
  const editId = useId()
  const problem = draft ? errorTextsProblem(draft.original, draft.proposed) : null
  const decide = (action) => {
    if (busy || (action === 'approve' && problem)) return
    onDecide(action, { applyToText: false, note, edit: action === 'approve' ? decisionEdit(report, draft) : null })
  }
  return (
    <section className="flex flex-col gap-3 border-t border-outline-variant pt-3" aria-label="הכרעה בדיווח">
      <p className="text-body-sm text-on-surface-variant">ההכרעה נשמרת בדיווח בלבד ואינה משנה את טקסט העמוד. אם נדרש שינוי, יש לפתוח את העמוד ולערוך אותו ידנית.</p>
      <Button variant="text" size="sm" icon={draft ? 'undo' : 'edit'} onClick={() => onDraftChange(draft ? null : { original: report.original || '', proposed: report.proposed || '' })}
        softDisabled={busy} aria-expanded={Boolean(draft)} aria-controls={editId}>
        {draft ? 'בטל את העריכה' : 'ערוך את הנוסח'}
      </Button>
      <div id={editId}>{draft && <EditVersionFields draft={draft} onChange={onDraftChange} problem={problem} context={name} disabled={busy} />}</div>
      <NoteField value={note} onChange={onNoteChange} context={name} disabled={busy} />
      <div className="flex flex-wrap gap-3">
        <Button variant="filled" icon="check" onClick={() => decide('approve')} softDisabled={busy || Boolean(problem)} aria-label={`אשר את התיקון — ${name}`} aria-keyshortcuts="A">אשר</Button>
        <Button variant="outlined" icon="close" onClick={() => decide('reject')} softDisabled={busy} aria-label={`דחה את התיקון — ${name}`} aria-keyshortcuts="R">דחה</Button>
      </div>
    </section>
  )
}
