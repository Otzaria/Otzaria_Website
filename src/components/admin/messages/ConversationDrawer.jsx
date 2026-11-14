'use client'

import { useCallback, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { unsavedConfirm, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { counterpart, isUnread, recipientSide, subjectText } from '@/lib/adminMessagesScreen/conversations'
import RelativeTime from '@/components/ui/RelativeTime'
import { longTimeText } from '@/lib/adminMessagesScreen/messageTerms'
import RecipientsList from './RecipientsList'
import ReplyForm from './ReplyForm'
import ThreadList from './ThreadList'

const DANGER_TEXT = 'text-error! hover:bg-error-container/60!'

/** הסבר שקט בגוף המגירה (במקום הודעה כחולה) — למשל למה אין "השב" */
function QuietNote({ children }) {
  return <p className="rounded-(--radius-control) bg-surface-container-low p-3 text-body-sm text-on-surface-variant">{children}</p>
}

/**
 * מגירת שיחה — ל"נכנסות" (message) ול"נשלחו" (group: הודעה לנמען אחד, או לכמה). בראש — הנושא, עם מי השיחה
 * (הצד שאינו מהצוות — גם כשהצוות פתח אותה) ומתי; בגוף — השרשור, ומתחתיו "השב ל…" — למי שבאמת יקבל את התשובה.
 * אין "השב" בהודעה לכמה נמענים (עם הסבר), בהודעה שנחסמה לתשובות, וכשהצד השני נמחק. בתחתית — "סמן כנקרא"
 * (רק לחדשה) ו"מחק לצמיתות" באדום, אחרון.
 * טקסט שלא נשלח — "לצאת בלי לשמור?" לפני סגירה; אבל בזמן "שולח…" סוגרים בלי לשאול (התשובה ממשיכה; כשל —
 * onReplyLost, והטקסט נשמר בטיוטה).
 *
 * @param {{ message?: any, group?: any, actions: ReturnType<typeof import('./useMessageActions').useMessageActions>,
 *   drafts: ReturnType<typeof import('./useReplyDrafts').useReplyDrafts>, onReplyLost?: (message: any, error: any, name: string) => void,
 *   onClose: () => void, returnFocus?: () => HTMLElement | null }} props
 */
export default function ConversationDrawer({ message: inboxMessage, group, actions, drafts, onReplyLost, onClose, returnFocus }) {
  const [confirm, confirmElement] = useConfirm()
  const [dirty, setDirty] = useState(false)
  const [sending, setSending] = useState(false)
  const message = inboxMessage || group?.messages?.[0]
  const many = (group?.recipients?.length || 0) > 1
  const unread = Boolean(inboxMessage) && isUnread(inboxMessage)
  const busy = actions.busy.has(message.id)
  const { guardLeave } = useUnsavedChangesGuard(dirty && !sending, () => confirm(unsavedConfirm('התשובה שכתבת לא נשלחה.')), { trapBack: false })

  const close = useCallback(async () => {
    if (sending) {
      onClose()
      return
    }
    if (!(await guardLeave())) return
    drafts?.clear(message.id) // יצא בלי לשמור — הטיוטה נמחקת
    onClose()
  }, [sending, guardLeave, onClose, drafts, message.id])

  const other = inboxMessage ? counterpart(message) : recipientSide(message)
  const author = message.senderName || 'משתמש לא ידוע'
  const team = other.side === 'recipient' // הצוות פתח את השיחה
  const canReply = message.allowReplies !== false && !many && !other.gone
  const subject = subjectText(message.subject)

  // אחרי מחיקה המסך סוגר את המגירה בעצמו (onRemoved ב-useMessageActions) — כאן לא סוגרים שוב
  const remove = () => (group ? actions.removeSent(group) : actions.remove(message))

  return (
    <Drawer
      // נושא ארוך (קישור שהודבק) — עד 3 שורות, כדי שהשיחה עצמה תישאר במסך; המלא בריחוף
      title={<span title={subject} className="line-clamp-3 [overflow-wrap:anywhere]">{subject}</span>}
      subtitle={(
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {many ? (
            <span>אל {group.recipients.length.toLocaleString('he-IL')} נמענים</span>
          ) : (
            <span className="min-w-0 [overflow-wrap:anywhere]">{!team ? 'מאת' : inboxMessage ? 'שיחה עם' : 'אל'} {other.name}</span>
          )}
          <RelativeTime date={message.createdAt} format={longTimeText} />
          {unread && <Badge tone="neutral">חדש</Badge>}
          {other.email && !many && <span className="min-w-0 basis-full [overflow-wrap:anywhere]"><bdi dir="ltr">{other.email}</bdi></span>}
          {team && <span className="basis-full [overflow-wrap:anywhere]">{inboxMessage ? 'הצוות פתח את השיחה' : 'נשלחה'}, מאת {author}</span>}
        </span>
      )}
      onClose={close}
      returnFocus={returnFocus}
      footer={(
        <>
          {unread && (
            <Button variant="text" size="sm" icon="mark_email_read" disabled={busy} onClick={() => actions.markRead(message)}>סמן כנקרא</Button>
          )}
          <Button variant="text" size="sm" icon="delete_forever" disabled={busy} onClick={remove} className={DANGER_TEXT}>מחק לצמיתות</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-5">
        {many && <RecipientsList group={group} />}
        <ThreadList message={message} />
        {canReply ? (
          <ReplyForm
            recipientName={other.name}
            initialText={drafts?.get(message.id) || ''}
            onTextChange={(text) => drafts?.set(message.id, text)}
            onSend={(text) => actions.reply(message, text)}
            onDirtyChange={setDirty}
            onSendingChange={setSending}
            onLost={(error) => onReplyLost?.(message, error, other.name)}
          />
        ) : many ? (
          <QuietNote>אין "השב" בהודעה לכמה נמענים. נמען שמשיב — השיחה איתו מופיעה בנכנסות, ומשם אפשר לענות לו.</QuietNote>
        ) : other.gone ? (
          <QuietNote>החשבון של {other.side === 'sender' ? 'השולח' : 'הנמען'} נמחק, ולכן אין למי להשיב.</QuietNote>
        ) : (
          <QuietNote>אי אפשר להשיב על ההודעה הזו.</QuietNote>
        )}
      </div>
      {confirmElement}
    </Drawer>
  )
}
