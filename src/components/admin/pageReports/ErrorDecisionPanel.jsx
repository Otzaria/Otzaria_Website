'use client'

import { useId } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'
import { approvePreview, decisionEdit } from '@/lib/adminPageReportsScreen/pageReportsQuery'
import { errorTextsProblem } from '@/lib/pageReports/rules'
import {
  APPLY_BLOCKED_TEXT, APPROVE_CHOICES, APPROVE_CHOICE_TITLE, EDIT_TOGGLE_LABEL, KEEP_EDITED_BUSY_HINT, REJECT_HINT,
} from '@/lib/adminPageReportsScreen/pageReportsTerms'
import EditVersionFields from './EditVersionFields'
import NoteField from './NoteField'

/** שורת התצוגה המקדימה: מה ייכתב בטקסט העמוד באפשרות הזו */
function PreviewLine({ preview, id }) {
  return (
    <p id={id} dir="rtl" className="min-w-0 text-body-md text-on-surface-variant [overflow-wrap:anywhere]">
      <span className="sr-only">ייכתב בטקסט: </span>
      {preview.before}
      <span className="rounded-(--radius-xs) bg-surface-container-high px-1 font-medium text-on-surface">{preview.middle}</span>
      {preview.after}
    </p>
  )
}

/**
 * אפשרות אישור אחת: כפתור, הסבר קצר, ותצוגה מקדימה של התוצאה.
 * פעיל — כפתור מלא (filled, כמו הפעולה הראשית); חסום — מראה אחר לגמרי (מתאר, אייקון מנעול, מסגרת מקווקוות,
 * סמן "אסור" ו-title עם הסיבה), כדי שלא יתבלבלו בין "פעיל" ל"מושבת". החסום — softDisabled ולא disabled: נשאר
 * בסדר הטאב, וקורא המסך מקריא את הסיבה (aria-describedby). אסור לסמוך על הצבע לבדו — לכן גם הסיבה כתובה.
 */
function ApproveOption({ choice, preview, disabled, blockedText, hint, busy, name, shortcut, onClick }) {
  const hintId = useId()
  const previewId = useId()
  return (
    <div className={cx(
      'flex flex-col gap-2 rounded-(--radius-control) border p-3 sm:flex-row sm:items-center sm:gap-4',
      disabled ? 'border-dashed border-outline-variant bg-surface-container-low' : 'border-outline-variant',
    )}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <PreviewLine preview={preview} id={previewId} />
        <p id={hintId} className="flex items-start gap-1 text-body-sm text-on-surface-variant">
          {disabled && <AppIcon name="lock" className="mt-0.5 shrink-0 text-icon-sm" />}
          <span>{disabled ? blockedText : (hint || choice.hint)}</span>
        </p>
      </div>
      {/* הכפתור החסום לא מקבל אירועי עכבר (pointer-events-none) — הסמן וה-title על העטיפה */}
      <span className={cx('shrink-0 self-start sm:self-center', disabled && 'cursor-not-allowed')} title={disabled ? blockedText || undefined : undefined}>
        <Button
          variant={disabled ? 'outlined' : 'filled'}
          icon={disabled ? 'lock' : 'check'}
          onClick={onClick}
          softDisabled={disabled || busy}
          aria-busy={busy || undefined}
          aria-label={`${choice.label} — ${name}`}
          aria-describedby={`${previewId} ${hintId}`}
          aria-keyshortcuts={shortcut}
          data-state={disabled ? 'blocked' : 'enabled'}
        >
          {choice.label}
        </Button>
      </span>
    </div>
  )
}

/**
 * ההכרעה בטעות שממתינה: שתי דרכי אישור, כל אחת בכפתור משלה עם התוצאה בטקסט —
 *   "אשר והשאר בסוגריים" — (טעות)[תיקון] נשאר בטקסט, המוסכמה המקובלת (applyToText: false)
 *   "אשר והחלף בתיקון"   — רק התיקון (applyToText: true); מושבת עם הסבר כשהעמוד בעריכה / הסימון חסר
 * ומתחת — הערה למדווח ו"דחה" (הסימון נשאר; אפשר להחזיר את הטקסט שבספר אחר כך ב"החל על הטקסט").
 * "ערוך את הנוסח" — המנהל מתקן את מה שהמדווח כתב (draft, מוחזק בכרטיס); התצוגות המקדימות לפי הנוסח הערוך, והאישור
 * שולח אותו (רק אם שונה). נוסח לא תקין — הודעה, והאישור מושבת.
 *
 * @param {{ report: any, name: string, busy: boolean, replaceChoice: { disabled: boolean, blockReason: string | null },
 *   note: string, onNoteChange: (v: string) => void,
 *   draft: { original: string, proposed: string } | null, onDraftChange: (draft: { original: string, proposed: string } | null) => void,
 *   onDecide: (action: 'approve' | 'reject', options: { applyToText: boolean, note: string, edit?: object | null }) => void }} props
 */
export default function ErrorDecisionPanel({ report, name, busy, replaceChoice, onDecide, note, onNoteChange, draft, onDraftChange }) {
  const titleId = useId()
  const rejectHintId = useId()
  const editId = useId()
  const problem = draft ? errorTextsProblem(draft.original, draft.proposed) : null
  const shown = draft ? { ...report, original: draft.original, proposed: draft.proposed } : report
  const decide = (action, applyToText) => {
    if (busy || (action === 'approve' && problem)) return
    onDecide(action, { applyToText, note, edit: action === 'approve' ? decisionEdit(report, draft) : null })
  }
  const toggleEdit = () => onDraftChange(draft ? null : { original: report.original || '', proposed: report.proposed || '' })

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 border-t border-outline-variant pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={titleId} className="text-title-sm text-on-surface">{APPROVE_CHOICE_TITLE}</p>
        <Button variant="text" size="sm" icon={draft ? 'undo' : 'edit'} onClick={toggleEdit} softDisabled={busy}
          aria-expanded={Boolean(draft)} aria-controls={editId}>
          {draft ? 'בטל את העריכה' : EDIT_TOGGLE_LABEL}
        </Button>
      </div>
      <div id={editId}>
        {draft && <EditVersionFields draft={draft} onChange={onDraftChange} problem={problem} context={name} disabled={busy} />}
      </div>
      <ApproveOption choice={APPROVE_CHOICES.keep} preview={approvePreview(shown, 'keep')} shortcut="A" busy={busy} name={name}
        disabled={Boolean(problem)} blockedText={problem} onClick={() => decide('approve', false)}
        hint={replaceChoice.disabled && decisionEdit(report, draft) ? KEEP_EDITED_BUSY_HINT : null} />
      <ApproveOption choice={APPROVE_CHOICES.replace} preview={approvePreview(shown, 'replace')} busy={busy} name={name}
        disabled={replaceChoice.disabled || Boolean(problem)} blockedText={replaceChoice.disabled ? (APPLY_BLOCKED_TEXT[replaceChoice.blockReason] || APPLY_BLOCKED_TEXT.unavailable) : problem}
        onClick={() => { if (!replaceChoice.disabled) decide('approve', true) }} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56"><NoteField value={note} onChange={onNoteChange} context={name} disabled={busy} /></div>
        <Button variant="outlined" icon="close" className="shrink-0" onClick={() => decide('reject', false)} softDisabled={busy}
          aria-label={`דחה את התיקון — ${name}`} aria-describedby={rejectHintId} aria-keyshortcuts="R">
          דחה
        </Button>
      </div>
      <p id={rejectHintId} className="text-body-sm text-on-surface-variant">{REJECT_HINT}</p>
    </section>
  )
}
