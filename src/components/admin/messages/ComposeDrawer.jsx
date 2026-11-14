'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import SelectMenu from '@/components/ui/SelectMenu'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { unsavedConfirm, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import {
  audienceCountText, broadcastAudienceCount, broadcastConfirm, composeDelivery, composeMissing, sentToAllText,
} from '@/lib/adminMessagesScreen/messageTerms'
import MessagePreview from './MessagePreview'
import { loadAllUsers, loadRecipients, sendMessage } from './messagesApi'

const AUDIENCE_ONE = 'one'
const AUDIENCE_ALL = 'all'

/** רשימה שנטענת כשצריך אותה (enabled): { status, list, error, retry } */
function useLazyList(loader, enabled) {
  const [state, setState] = useState({ status: 'idle', list: [], error: null })
  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      setState({ status: 'ready', list: await loader(), error: null })
    } catch (error) {
      setState({ status: 'error', list: [], error })
    }
  }, [loader])
  const started = useRef(false)
  useEffect(() => {
    if (!enabled || started.current) return
    started.current = true
    load()
  }, [enabled, load])
  return { ...state, retry: load }
}

/** שגיאת שדה (מה חסר) */
function FieldError({ id, children }) {
  if (!children) return null
  return (
    <p id={id} className={FIELD_ERROR}>
      <AppIcon name="error" className="mt-0.5 shrink-0 text-icon-sm" />
      <span>{children}</span>
    </p>
  )
}

/**
 * "הודעה חדשה" — מגירה. למי: משתמש אחד (בורר עם חיפוש לפי שם או דואר), או כל המשתמשים — רק מה שהשרת יודע
 * לשלוח (send-admin: recipientId או sendToAll; אין שליחה לפי תפקיד או למנויי ספר). נושא, תוכן ותצוגה מקדימה
 * של מה שהנמען יראה. "שלח" לא מושבת: כשחסר משהו — ליד השדה כתוב מה ("כתוב נושא"), והפוקוס עובר אליו.
 * לכולם — חלון אישור, ובו כמה יקבלו: מנהל כללי — במדויק, כמו השרת (/api/admin/users); אחרים — "כ-42" (רק
 * משתמשים רגילים ברשימה; השרת שולח גם למפתחים ולמי שאין לו תפקיד). 0 נמענים (במדויק) — לא שולחים, ואומרים
 * למה. המספר בגוף החלון, לא על הכפתור. ההודעה מגיעה באתר בלבד, וזה כתוב בטופס ובחלון. טקסט שלא נשלח —
 * "לצאת בלי לשמור?".
 *
 * @param {{ viewerName?: string, exactAudience?: boolean, onClose: () => void,
 *   onSent: (result: { message: string, tone?: string, toAll: boolean }) => void }} props
 */
export default function ComposeDrawer({ viewerName, exactAudience = false, onClose, onSent }) {
  const [confirm, confirmElement] = useConfirm()
  const [audience, setAudience] = useState(AUDIENCE_ONE)
  const toAll = audience === AUDIENCE_ALL
  const recipients = useLazyList(loadRecipients, true)
  const everyone = useLazyList(loadAllUsers, exactAudience && toAll)
  const [userId, setUserId] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState({})
  const ids = { subject: useId(), text: useId(), error: useId() }
  const userBox = useRef(null)

  const user = recipients.list.find((u) => u._id === userId) || null
  const dirty = (subject.trim() !== '' || text.trim() !== '') && !sending
  const { guardLeave } = useUnsavedChangesGuard(dirty, () => confirm(unsavedConfirm('ההודעה שכתבת לא נשלחה.')), { trapBack: false })
  const close = useCallback(async () => {
    if (await guardLeave()) onClose()
  }, [guardLeave, onClose])

  // כמה יקבלו "לכל המשתמשים": במדויק (מנהל כללי), או הערכה מרשימת המשתמשים הרגילים
  const exact = exactAudience && everyone.status === 'ready'
  const count = exact ? broadcastAudienceCount(everyone.list) : recipients.status === 'ready' ? recipients.list.length : NaN
  const countText = audienceCountText(count, { exact })
  const noOne = exact && count === 0

  const audienceOptions = [
    { value: AUDIENCE_ONE, label: 'משתמש אחד', description: 'בוחרים משתמש מהרשימה' },
    { value: AUDIENCE_ALL, label: 'כל המשתמשים', description: countText ? `כל מי שאינו מנהל — ${countText}` : 'כל מי שאינו מנהל' },
  ]
  const userOptions = recipients.list.map((u) => ({ value: u._id, label: u.name || '(בלי שם)', hint: u.email }))

  const clearMissing = (field) => setMissing((m) => (m[field] ? { ...m, [field]: undefined } : m))

  const send = async () => {
    if (sending) return
    setError(null)
    const gaps = composeMissing({ toAll, hasUser: Boolean(user), subject, text })
    if (gaps.length > 0) {
      setMissing(Object.fromEntries(gaps.map((g) => [g.field, g.message])))
      const first = gaps[0].field
      const target = first === 'user' ? userBox.current?.querySelector('button') : document.getElementById(ids[first])
      target?.focus?.()
      return
    }
    setMissing({})
    if (toAll) {
      const question = broadcastConfirm(count, { exact })
      if (!question) {
        setError('אין כרגע משתמשים שאינם מנהלים, ולכן אין למי לשלוח.')
        return
      }
      if (!(await confirm(question))) return
    }
    setSending(true)
    try {
      const result = await sendMessage({ recipientId: toAll ? null : user._id, subject, message: text, sendToAll: toAll })
      onSent(toAll ? { ...sentToAllText(result.message), toAll } : { message: `ההודעה נשלחה ל${user.name || 'משתמש'}`, toAll })
    } catch (e) {
      setError(e?.message || 'לא הצלחנו לשלוח את ההודעה. נסה שוב.')
      setSending(false)
    }
  }

  return (
    <Drawer
      title="הודעה חדשה"
      subtitle={composeDelivery(toAll)}
      onClose={close}
      dismissible={!sending}
      footer={(
        <>
          {error && <p id={ids.error} role="alert" className="me-auto min-w-0 flex-1 basis-48 text-body-sm text-error">{error}</p>}
          <Button variant="text" size="sm" onClick={close} disabled={sending}>ביטול</Button>
          <Button variant="filled" size="sm" icon="send" onClick={send} loading={sending}>
            {sending ? 'שולח…' : toAll ? 'שלח לכל המשתמשים' : 'שלח'}
          </Button>
        </>
      )}
    >
      {/* Enter בשדה הנושא לא שולח — שולחים רק בכפתור */}
      <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()} noValidate>
        <div>
          <SelectMenu label="למי" labelSize="lg" options={audienceOptions} value={audience} onChange={setAudience} searchable={false} highlight={false} disabled={sending} />
          {toAll && noOne && <p className={FIELD_HINT}>אין כרגע משתמשים שאינם מנהלים — ההודעה לא תגיע לאף אחד.</p>}
          {toAll && exactAudience && everyone.status === 'error' && (
            <div className={FIELD_HINT}>
              <span>לא הצלחנו לספור את המשתמשים במדויק{countText ? ` (בערך ${countText.replace(/^כ-/, '')})` : ''}.</span>{' '}
              <Button variant="text" size="sm" icon="refresh" onClick={everyone.retry}>נסה שוב</Button>
            </div>
          )}
        </div>

        {!toAll && (
          <div ref={userBox}>
            <SelectMenu
              label="משתמש"
              labelSize="lg"
              options={userOptions}
              value={userId}
              onChange={(v) => {
                setUserId(v || '')
                clearMissing('user')
              }}
              searchable
              searchPlaceholder="חפש לפי שם או דואר"
              placeholder={recipients.status === 'ready' ? 'בחר משתמש' : 'טוען את רשימת המשתמשים…'}
              disabled={sending || recipients.status !== 'ready'}
              highlight={false}
              emptyText="לא נמצא משתמש"
            />
            {user && <p className={FIELD_HINT}><bdi dir="ltr" className="[overflow-wrap:anywhere]">{user.email}</bdi></p>}
            <FieldError>{missing.user}</FieldError>
            {recipients.status === 'error' && (
              <div className={FIELD_ERROR} role="alert">
                <span className="min-w-0 flex-1">{recipients.error?.message || 'לא הצלחנו לטעון את רשימת המשתמשים.'}</span>
                <Button variant="text" size="sm" icon="refresh" onClick={recipients.retry}>נסה שוב</Button>
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor={ids.subject} className={FIELD_LABEL}>נושא</label>
          <input
            id={ids.subject}
            type="text"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value)
              clearMissing('subject')
            }}
            aria-invalid={missing.subject ? true : undefined}
            aria-describedby={missing.subject ? `${ids.subject}-missing` : undefined}
            className={fieldClasses()}
            disabled={sending}
            required
          />
          <FieldError id={`${ids.subject}-missing`}>{missing.subject}</FieldError>
        </div>

        <div>
          <label htmlFor={ids.text} className={FIELD_LABEL}>תוכן</label>
          <textarea
            id={ids.text}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              clearMissing('text')
            }}
            rows={6}
            placeholder="כתוב את ההודעה כאן"
            aria-invalid={missing.text ? true : undefined}
            aria-describedby={missing.text ? `${ids.text}-missing` : undefined}
            className={fieldClasses({ kind: 'textarea', className: 'resize-y' })}
            disabled={sending}
            required
          />
          <FieldError id={`${ids.text}-missing`}>{missing.text}</FieldError>
        </div>

        <MessagePreview subject={subject} text={text} senderName={viewerName} />
      </form>
      {confirmElement}
    </Drawer>
  )
}
