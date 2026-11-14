'use client'

import { useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { apiPost } from '@/lib/api-utils'
import { ACCESS_NOTE, canRequest } from '@/lib/trainingProof/accessRules'

// מי שאין לו גישה (docs/75 ה-1): רק "אין לך הרשאת גישה לדף זה", ומתחת "בקשת גישה" —
// חלון עם הסבר על מטרת הדף וטופס. הבקשה נשמרת באתר ומגיעה למסך הניהול.
export default function NoAccess({ access, onRequested }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const note = ACCESS_NOTE[access] || ''

  const send = async (e) => {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      await apiPost('/api/training-proof/access-request', { message })
      setOpen(false)
      onRequested?.()
    } catch (err) {
      setError(err.message || 'שליחת הבקשה נכשלה — נסו שוב')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-4 text-center">
      <AppIcon name="lock" className="text-5xl text-on-surface-variant" />
      <h1 className="text-headline-md font-bold text-on-surface">אין לך הרשאת גישה לדף זה</h1>
      {note ? (
        <p
          className={`flex items-start gap-2 rounded-xl px-4 py-2.5 text-body-md ${access === 'pending' ? 'bg-success-container text-on-success-container' : 'bg-info-container text-on-info-container'}`}
          role="status"
        >
          <AppIcon name={access === 'pending' ? 'hourglass_top' : 'info'} />
          {note}
        </p>
      ) : null}
      {canRequest(access) ? (
        <Button variant="tonal" icon="key" onClick={() => setOpen(true)}>
          בקשת גישה
        </Button>
      ) : null}
      {open ? (
        <Dialog
          title="בקשת גישה — הגהה לאימון המודלים"
          onClose={() => setOpen(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="text" onClick={() => setOpen(false)}>
                ביטול
              </Button>
              <Button type="submit" form="tp-access-form" icon="send" loading={sending}>
                שליחת הבקשה
              </Button>
            </div>
          }
        >
          <form id="tp-access-form" onSubmit={send} className="flex flex-col gap-3 text-start">
            <p className="text-body-md text-on-surface-variant">
              בדף הזה מגיהים את החומר שעליו מאמנים את מודלי הזיהוי של אוצריא: שורות טקסט, סוגי הכתב, ואזורי הטקסט
              בעמוד. טעות כאן נכנסת ישר לאימון, ולכן הגישה פתוחה רק לקבוצה קטנה של מגיהים שאושרו בידי מנהל הפרויקט.
            </p>
            <label htmlFor="tp-access-msg" className="text-label-lg font-semibold text-on-surface">
              ספרו בקצרה על הניסיון שלכם בהגהה <span className="font-normal text-on-surface-variant">(לא חובה)</span>
            </label>
            <textarea
              id="tp-access-msg"
              rows={3}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder='למשל: אני מגיה ספרי קודש, מכיר כתב רש"י'
              className="w-full rounded-lg border border-outline bg-surface p-2.5 text-body-md text-on-surface"
              autoFocus
            />
            {error ? (
              <p className="text-body-sm text-error" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </Dialog>
      ) : null}
    </div>
  )
}
