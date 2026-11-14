'use client'

import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { FIELD_ERROR, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { requestJson } from '@/components/admin/list/adminRequest'

const SEND_FAILED = 'לא הצלחנו לשלוח את ההודעה. נסה שוב.'

/**
 * חלון שליחת הודעה למשתמש — משותף למסך ההעלאות (למי שהעלה ספר/עמוד) ולמסך "משתמשים" (מהשורה ומהמגירה).
 * ההודעה נשמרת באתר (POST /api/messages/send-admin) ומופיעה אצלו שם; היא לא נשלחת בדואר — וזה נאמר בחלון,
 * כי הצגת הכתובת לבדה רומזת לדואר.
 *
 * הנמען: מזהה המשתמש מגיע עם ההעלאה (recipient.id — מהשרת, בעמוד ההעלאות), וההודעה נשלחת ישר.
 * רק כשאין מזהה (רשימה שנטענה מחדש מ-/api/admin/uploads/list, שלא מחזיר אותו) — חיפוש לפי הדואר
 * ברשימת המשתמשים, כמו קודם (איטי: הרשימה גדולה).
 * "שלח הודעה" מושבת עד שיש נושא ותוכן. הצלחה — הודעה קופצת ("ההודעה נשלחה למשה") והחלון נסגר;
 * כשל — שגיאה בתוך החלון, והטקסט נשמר. בזמן שליחה אי אפשר לסגור. הבקשות דרך list/adminRequest: התחברות שפגה
 * (הפניה לדף ההתחברות, תשובת HTML) — שגיאה עם הסבר, לא "הצלחה".
 *
 * Props:
 * - recipient: { id?, email, name } - נמען ההודעה
 * - initialSubject: נושא ברירת המחדל של ההודעה
 * - onClose(): סגירת הדיאלוג
 */
export default function MessageUploaderDialog({ recipient, initialSubject, onClose }) {
  const toast = useToast()
  const [subject, setSubject] = useState(initialSubject || '')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const subjectId = useId()
  const textId = useId()
  const errorId = useId()
  const ready = subject.trim() !== '' && text.trim() !== ''

  const findRecipientId = async () => {
    if (recipient.id) return recipient.id
    const fallback = 'לא הצלחנו למצוא את המשתמש. נסה שוב.'
    // רשימת המשתמשים המלאה איטית — מגבלת זמן ארוכה מהרגיל
    const data = await requestJson('/api/admin/users', { fallback, timeoutMs: 120000 })
    if (!data.success || !Array.isArray(data.users)) throw new Error(fallback)
    const user = data.users.find((u) => u.email === recipient.email)
    if (!user) throw new Error('לא נמצא משתמש עם כתובת הדואר הזו.')
    return user._id
  }

  const send = async () => {
    if (!ready || sending) return
    setSending(true)
    setError('')
    try {
      const recipientId = await findRecipientId()
      const result = await requestJson('/api/messages/send-admin', {
        method: 'POST',
        body: { recipientId, subject, message: text, sendToAll: false },
        fallback: SEND_FAILED,
      })
      if (!result.success) throw new Error(SEND_FAILED)
      toast.show({ message: `ההודעה נשלחה ל${recipient.name}` })
      onClose()
    } catch (e) {
      setError(e?.message || SEND_FAILED)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      title="שלח הודעה"
      subtitle={<>אל {recipient.name} (<bdi dir="ltr">{recipient.email}</bdi>). ההודעה תופיע אצלו באתר, ולא תישלח בדואר.</>}
      onClose={onClose}
      dismissible={!sending}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={sending}>ביטול</Button>
          <Button variant="filled" size="sm" icon="send" onClick={send} loading={sending} disabled={!ready}>
            {sending ? 'שולח…' : 'שלח הודעה'}
          </Button>
        </>
      )}
    >
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); send() }}>
        <div>
          <label htmlFor={subjectId} className={FIELD_LABEL}>נושא</label>
          <input
            id={subjectId}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={fieldClasses()}
            disabled={sending}
            required
          />
        </div>

        <div>
          <label htmlFor={textId} className={FIELD_LABEL}>תוכן ההודעה</label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="כתוב את ההודעה כאן"
            aria-describedby={error ? errorId : undefined}
            className={fieldClasses({ kind: 'textarea', className: 'resize-y' })}
            disabled={sending}
            required
          />
          {error && <p id={errorId} role="alert" className={FIELD_ERROR}>{error}</p>}
        </div>
      </form>
    </Dialog>
  )
}
