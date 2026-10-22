'use client'

import { useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Ltr from '@/components/ui/Ltr'
import { formatDateTime, jobShortId } from './ocrJobView'
import { conflictReasonLabel } from '@/lib/ocr/ocrConflictView'

const STATUS = {
  open: { label: 'ממתינה להחלטה', tone: 'warning' },
  applying: { label: 'אימוץ ה-OCR בתהליך', tone: 'info' },
  applied: { label: 'אומץ טקסט ה-OCR', tone: 'success' },
  dismissed: { label: 'נשמר הטקסט הקיים', tone: 'neutral' },
}

/**
 * התנגשות אחת: טקסט OCR שלא נכתב לעמוד — העמוד נערך אחרי יצירת העבודה (page_changed), או שהעבודה
 * בוטלה והעמוד זוהה לפני הביטול (job_cancelled); הסיבה מוצגת כתווית. מציג את הטקסט
 * הנוכחי (האנושי) מול טקסט ה-OCR — שניהם כטקסט רגיל — ומאפשר לאמץ את ה-OCR (באישור) או
 * לשמור את הקיים. האימוץ נשלח עם updatedAt של העמוד כפי שהוצג כאן; השרת דוחה אותו אם
 * העמוד נערך שוב בינתיים. showJob — מציג גם מאיזו עבודה ההתנגשות (ברשימה ברמת הספר).
 *
 * @param {{
 *   conflict: any,
 *   busy?: boolean,
 *   error?: string,
 *   showJob?: boolean,
 *   onApply: (conflict:any) => void,
 *   onDismiss: (conflict:any) => void,
 * }} props
 */
export default function OcrConflictItem({ conflict, busy = false, error = '', showJob = false, onApply, onDismiss }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const status = STATUS[conflict.status] || STATUS.open
  const isOpen = conflict.status === 'open'
  const textsId = `conflict-texts-${conflict.id}`

  return (
    <li className="rounded-control border border-outline-variant">
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-on-surface">עמוד {conflict.pageNumber ?? '—'}</span>
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="text-xs text-on-surface-variant">{conflictReasonLabel(conflict.reason)}</span>
          {showJob && conflict.jobId && (
            <span className="text-xs text-on-surface-variant">
              מעבודה <Ltr className="font-mono">{jobShortId(conflict.jobId)}</Ltr>
              {conflict.jobCreatedAt ? ` מ-${formatDateTime(conflict.jobCreatedAt)}` : ''}
            </span>
          )}
        </div>
        <Button
          variant="text"
          size="sm"
          iconEnd={open ? 'expand_less' : 'expand_more'}
          aria-expanded={open}
          aria-controls={textsId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'הסתר' : 'הצג טקסטים'}
        </Button>
      </div>

      {open && (
        <div id={textsId} className="space-y-3 border-t border-outline-variant p-2.5">
          {conflict.pageExists ? (
            <TextBlock
              title="הטקסט הנוכחי בעמוד"
              meta={conflict.pageUpdatedAt ? `עודכן ${formatDateTime(conflict.pageUpdatedAt)}` : ''}
            >
              {conflict.pageIsTwoColumns
                ? `${conflict.pageRightColumn}\n\n— טור שמאלי —\n\n${conflict.pageLeftColumn}`
                : conflict.pageContent}
            </TextBlock>
          ) : (
            <p className="text-sm text-on-surface-variant">העמוד נמחק מהספר — אין מה לאמץ.</p>
          )}
          <TextBlock title="טקסט ה-OCR">{conflict.ocrText}</TextBlock>

          {isOpen && (
            confirming ? (
              <div className="space-y-2 rounded-control bg-surface-container p-2.5">
                <p className="text-sm text-on-surface">הטקסט הנוכחי בעמוד יוחלף בטקסט ה-OCR. להמשיך?</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="filled"
                    size="sm"
                    loading={busy}
                    onClick={() => {
                      setConfirming(false)
                      onApply(conflict)
                    }}
                  >
                    כן, לאמץ את ה-OCR
                  </Button>
                  <Button variant="text" size="sm" onClick={() => setConfirming(false)}>
                    ביטול
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {conflict.pageExists && (
                  <Button variant="tonal" size="sm" icon="done" disabled={busy} onClick={() => setConfirming(true)}>
                    אמץ את טקסט ה-OCR
                  </Button>
                )}
                <Button variant="outlined" size="sm" icon="undo" loading={busy} onClick={() => onDismiss(conflict)}>
                  שמור את הטקסט הקיים
                </Button>
              </div>
            )
          )}

          {!isOpen && conflict.resolvedByName && (
            <p className="text-xs text-on-surface-variant">
              טופל בידי {conflict.resolvedByName}
              {conflict.resolvedAt ? ` · ${formatDateTime(conflict.resolvedAt)}` : ''}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="px-2.5 pb-2.5 text-sm text-error">{error}</p>
      )}
    </li>
  )
}

function TextBlock({ title, meta, children }) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-on-surface">{title}</span>
        {meta && <span className="text-xs text-on-surface-variant">{meta}</span>}
      </div>
      <pre dir="rtl" className="scrollbar-thin max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-control bg-surface-container p-2 font-sans text-sm text-on-surface">
        {children || '(ריק)'}
      </pre>
    </div>
  )
}
