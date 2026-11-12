'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { loginHref } from '@/components/admin/list/adminRequest'
import { REPLY_DELIVERY } from '@/lib/adminMessagesScreen/messageTerms'

/**
 * "השב" בתחתית השיחה: שדה טקסט, איך התשובה מגיעה (באתר, לא בדואר), ו"שלח תשובה" — הכפתור הבולט היחיד במגירה.
 * הכפתור לא מושבת: בלי טקסט — "כתוב תשובה" ליד השדה (כפתור מושבת לא אומר מה חסר, ומקלדת לא מגיעה אליו).
 * כשל — הודעה מתחת לשדה, והטקסט נשמר; התחברות שפגה — עם קישור "התחבר" (הטיוטה נשמרת, ראו useReplyDrafts).
 * המגירה נסגרה באמצע "שולח…" והשליחה נכשלה — onLost (הודעה קופצת עם "פתח שוב"), והטקסט נשאר בטיוטה.
 *
 * @param {{ recipientName: string, initialText?: string, onSend: (text: string) => Promise<void>,
 *   onTextChange?: (text: string) => void, onDirtyChange?: (dirty: boolean) => void, onSendingChange?: (sending: boolean) => void,
 *   onLost?: (error: any) => void }} props
 */
export default function ReplyForm({ recipientName, initialText = '', onSend, onTextChange, onDirtyChange, onSendingChange, onLost }) {
  const [text, setText] = useState(initialText)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null) // { message, sessionExpired }
  const id = useId()
  const fieldRef = useRef(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    onDirtyChange?.(initialText.trim() !== '')
    return () => { alive.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- רק בפתיחה: טיוטה שחזרה היא "טקסט שלא נשלח"
  }, [])

  const change = (value) => {
    setText(value)
    onTextChange?.(value)
    onDirtyChange?.(value.trim() !== '')
    if (error && value.trim() !== '') setError(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (sending) return
    if (text.trim() === '') {
      setError({ message: 'כתוב תשובה לפני השליחה.' })
      fieldRef.current?.focus()
      return
    }
    setSending(true)
    onSendingChange?.(true)
    setError(null)
    try {
      await onSend(text)
      if (alive.current) change('')
      else onTextChange?.('')
    } catch (e) {
      const failure = { message: e?.message || 'לא הצלחנו לשלוח את התשובה. נסה שוב.', sessionExpired: Boolean(e?.sessionExpired) }
      if (alive.current) setError(failure)
      else onLost?.(e)
    } finally {
      if (alive.current) {
        setSending(false)
        onSendingChange?.(false)
      }
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col border-t border-outline-variant/60 pt-5" noValidate>
      <label htmlFor={id} className={`${FIELD_LABEL} [overflow-wrap:anywhere]`}>{recipientName ? `השב ל${recipientName}` : 'השב'}</label>
      <textarea
        ref={fieldRef}
        id={id}
        value={text}
        onChange={(e) => change(e.target.value)}
        rows={4}
        placeholder="כתוב תשובה"
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={error && !text.trim() ? true : undefined}
        className={fieldClasses({ kind: 'textarea', className: 'resize-y' })}
        readOnly={sending}
      />
      <p id={`${id}-hint`} className={FIELD_HINT}>{REPLY_DELIVERY}</p>
      {error && (
        <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
          <span>
            {error.message}
            {error.sessionExpired && <> <a href={loginHref()} className="underline">התחבר</a></>}
          </span>
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button type="submit" variant="filled" size="sm" icon="reply" loading={sending}>
          {sending ? 'שולח…' : 'שלח תשובה'}
        </Button>
      </div>
    </form>
  )
}
