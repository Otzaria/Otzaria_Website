'use client'

import { useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Kbd from '@/components/ui/Kbd'
import Notice from '@/components/ui/Notice'
import { cx } from '@/components/ui/cx'
import { FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { MAX_MESSAGE } from '@/lib/pageReports/rules'
import { messageCharsLeft } from './reportLogic'

/**
 * חלון "הודעה למנהלים על העמוד": טקסט חופשי עד 2000 תווים, עם מונה תווים.
 * onSubmit מחזיר הודעת שגיאה או null בהצלחה (ההורה סוגר). Ctrl+Enter — שליחה.
 * children — תוכן נוסף מתחת לשדה (למשל "הדיווחים שלי על העמוד").
 *
 * @param {{ pageNumber: number, onSubmit: (message: string) => Promise<string | null>, onClose: () => void,
 *   children?: import('react').ReactNode }} props
 */
export default function PageMessageDialog({ pageNumber, onSubmit, onClose, children }) {
  const id = useId()
  const [message, setMessage] = useState('')
  const [error, setError] = useState(/** @type {string | null} */ (null))
  const [submitting, setSubmitting] = useState(false)
  // שתי לחיצות באותו רגע (לפני שה-state מתעדכן) — שליחה אחת בלבד
  const busy = useRef(false)
  const left = messageCharsLeft(message)

  const submit = async (event) => {
    event?.preventDefault()
    if (busy.current) return
    busy.current = true
    setSubmitting(true)
    setError(null)
    let failure
    try {
      failure = await onSubmit(message)
    } catch {
      failure = 'שליחת ההודעה נכשלה.'
    }
    if (failure) {
      busy.current = false
      setError(failure)
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      title="הודעה למנהלים"
      subtitle={`על עמוד ${pageNumber}: משהו שחשוב שהמנהלים יידעו (צילום חסר, עמוד כפול, הערה כללית).`}
      onClose={onClose}
      dismissible={!submitting}
      footer={
        <>
          <span className="me-auto hidden items-center gap-1.5 text-body-sm text-on-surface-variant sm:inline-flex">
            <Kbd keys={['Ctrl', 'Enter']} />
          </span>
          <Button variant="text" onClick={onClose} disabled={submitting}>ביטול</Button>
          <Button variant="filled" icon="send" loading={submitting} aria-keyshortcuts="Control+Enter" onClick={submit}>שליחה</Button>
        </>
      }
    >
      <form
        onSubmit={submit}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.repeat) submit(event) }}
        noValidate
      >
        <label htmlFor={id} className={FIELD_LABEL}>ההודעה</label>
        <textarea
          id={id}
          dir="rtl"
          value={message}
          maxLength={MAX_MESSAGE}
          onChange={(event) => setMessage(event.target.value)}
          aria-describedby={`${id}-count`}
          className={fieldClasses({ kind: 'textarea', className: 'min-h-32' })}
          data-autofocus=""
        />
        <p id={`${id}-count`} className={cx('mt-2 text-end text-body-sm', left < 100 ? 'text-error' : 'text-on-surface-variant')}>
          {left >= 0 ? `נשארו ${left} תווים` : `חריגה של ${-left} תווים`}
        </p>
        {error && <Notice tone="error" role="alert" className="mt-3">{error}</Notice>}
      </form>
      {children}
    </Dialog>
  )
}
