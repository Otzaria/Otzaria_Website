'use client'

import { useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Kbd from '@/components/ui/Kbd'
import Notice from '@/components/ui/Notice'
import { FIELD_HINT, FIELD_LABEL, fieldA11yProps, fieldClasses } from '@/components/ui/fieldStyles'
import MarkerPreview from './MarkerPreview'
import { BOOK_ERROR_SCOPE_TEXT } from './reportLogic'
import { MAX_MESSAGE, MAX_ORIGINAL, MAX_PROPOSED } from '@/lib/pageReports/rules'

/**
 * חלון "דיווח על טעות בספר": הטקסט שבספר (הבחירה, ניתן לעריכה), התיקון המוצע (עם הפוקוס,
 * ממולא מראש בבחירה כדי שיהיה קל לתקן אות אחת), הערה, ותצוגה מקדימה חיה של הסימון.
 * onSubmit מחזיר הודעת שגיאה (מוצגת בחלון) או null בהצלחה (ההורה סוגר את החלון).
 * Ctrl+Enter — שליחה.
 *
 * @param {{ initialText: string, columnLabel?: string | null,
 *   onSubmit: (values: { original: string, proposed: string, note: string }) => Promise<string | null>,
 *   onClose: () => void }} props
 */
export default function ErrorReportDialog({ initialText, columnLabel = null, onSubmit, onClose }) {
  const ids = { original: useId(), proposed: useId(), note: useId(), preview: useId() }
  const [original, setOriginal] = useState(initialText || '')
  const [proposed, setProposed] = useState(initialText || '')
  const [note, setNote] = useState('')
  const [error, setError] = useState(/** @type {string | null} */ (null))
  const [submitting, setSubmitting] = useState(false)
  // שתי לחיצות באותו רגע (לפני שה-state מתעדכן) — שליחה אחת בלבד
  const busy = useRef(false)

  const submit = async (event) => {
    event?.preventDefault()
    if (busy.current) return
    busy.current = true
    setSubmitting(true)
    setError(null)
    let message
    try {
      message = await onSubmit({ original, proposed, note })
    } catch {
      message = 'שליחת הדיווח נכשלה.'
    }
    // בהצלחה ההורה מסיר את החלון; בשגיאה — נשארים ומציגים אותה
    if (message) {
      busy.current = false
      setError(message)
      setSubmitting(false)
    }
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.repeat) submit(event)
  }

  return (
    <Dialog
      title="דיווח על טעות בספר"
      subtitle={`הטקסט שבספר יסומן בעמוד כ־(טקסט) [תיקון], והדיווח יישלח למנהלים${columnLabel ? ` · ${columnLabel}` : ''}.`}
      onClose={onClose}
      dismissible={!submitting}
      footer={
        <>
          <span className="me-auto hidden items-center gap-1.5 text-body-sm text-on-surface-variant sm:inline-flex">
            <Kbd keys={['Ctrl', 'Enter']} />
          </span>
          <Button variant="text" onClick={onClose} disabled={submitting}>ביטול</Button>
          <Button variant="filled" icon="flag" loading={submitting} aria-keyshortcuts="Control+Enter" onClick={submit}>שליחת הדיווח</Button>
        </>
      }
    >
      <form onSubmit={submit} onKeyDown={onKeyDown} className="space-y-4" noValidate>
        <Notice tone="info">{BOOK_ERROR_SCOPE_TEXT.map((line) => <p key={line}>{line}</p>)}</Notice>

        <div>
          <label htmlFor={ids.original} className={FIELD_LABEL}>הטקסט שבספר</label>
          <input
            {...fieldA11yProps(ids.original, { hint: true })}
            dir="rtl"
            value={original}
            maxLength={MAX_ORIGINAL}
            onChange={(event) => setOriginal(event.target.value)}
            className={fieldClasses()}
          />
          <p id={`${ids.original}-hint`} className={FIELD_HINT}>כפי שהוא מופיע בצילום, עם הטעות.</p>
        </div>

        <div>
          <label htmlFor={ids.proposed} className={FIELD_LABEL}>התיקון המוצע</label>
          <input
            {...fieldA11yProps(ids.proposed)}
            dir="rtl"
            value={proposed}
            maxLength={MAX_PROPOSED}
            onChange={(event) => setProposed(event.target.value)}
            className={fieldClasses()}
            data-autofocus=""
          />
        </div>

        <div>
          <p className={FIELD_LABEL} id={`${ids.preview}-label`}>כך זה ייכנס לטקסט</p>
          <MarkerPreview id={ids.preview} original={original} proposed={proposed} />
        </div>

        <div>
          <label htmlFor={ids.note} className={FIELD_LABEL}>הערה למנהלים (לא חובה)</label>
          <textarea
            id={ids.note}
            value={note}
            maxLength={MAX_MESSAGE}
            onChange={(event) => setNote(event.target.value)}
            placeholder="למשל: כך כתוב גם בדפוס אחר"
            className={fieldClasses({ kind: 'textarea', className: 'min-h-20' })}
          />
        </div>

        {error && <Notice tone="error" role="alert">{error}</Notice>}
      </form>
    </Dialog>
  )
}
