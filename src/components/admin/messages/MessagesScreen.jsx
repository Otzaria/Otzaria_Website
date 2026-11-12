'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import ErrorState from '@/components/ui/ErrorState'
import TabLinks from '@/components/ui/TabLinks'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import LoadError from '@/components/admin/list/LoadError'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import { groupMatchesSearch, groupSent, matchesSearch, splitBoxes, unreadCount, withLocalRead } from '@/lib/adminMessagesScreen/conversations'
import { MESSAGES_TITLE, messagesDescription, newCountLabel } from '@/lib/adminMessagesScreen/messageTerms'
import { updateMessagesQuery, viewHref } from '@/lib/adminMessagesScreen/messagesQuery'
import ComposeDrawer from './ComposeDrawer'
import ConversationDrawer from './ConversationDrawer'
import InboxView from './InboxView'
import { MessagesListSkeleton } from './MessagesSkeleton'
import RemindersView from './reminders/RemindersView'
import SentView from './SentView'
import { useMessageActions } from './useMessageActions'
import { useBulkLeaveGuard } from '@/components/admin/list/useBulkLeaveGuard'
import { useDrawerParam } from '@/components/admin/list/useDrawerParam'
import { useMessagesData, useMessagesQuery } from './useMessagesData'
import { useReplyDrafts } from './useReplyDrafts'

const TITLE_ID = 'messages-title'
const LIST_ID = 'messages-list'
/** האייקון של "תזכורות" — אותו אחד בלשונית ובסרגל (adminNav) */
export const REMINDERS_ICON = 'notifications'

/** כפתור השם בשורה (היעד של הפוקוס בחזרה מהמגירה) */
const rowButton = (id) => (id ? document.querySelector(`#${LIST_ID} [data-row="${CSS.escape(id)}"] [data-row-open]`) : null)

/**
 * "הודעות" (/library/admin/messages) — שלוש לשוניות בכתובת (?view=):
 *   נכנסות — כל מה שהצוות עוד לא קרא, ושיחות שמישהו שאינו מהצוות כתב בהן (ההגדרה המלאה — conversations.js).
 *   נשלחו — מה שרק הצוות כתב (הודעה לכל המשתמשים — שורה אחת).
 *   תזכורות — האשף ששולח תזכורת בדואר לעורכים (היה /library/admin/reminders) — רק למי שמורשה לו
 *     (canRemind: מנהל כללי ומנהל ספרים, כמו קודם; מנהל תוספים רואה הודעות בלי תזכורות).
 * החיפוש נשמר במעבר בין נכנסות לנשלחו, וכשאין תוצאות בלשונית אחת — "נמצאו גם בנשלחו".
 * שיחה — במגירה (?message=…; "אחורה" סוגר). "הודעה חדשה" — מגירה (בתזכורות — כפתור משני: הפעולה הבולטת שם
 * היא של האשף). אותן בקשות לשרת כמו קודם (messagesApi). כל פעולה שמשנה "חדש" מרעננת את המונה שבסרגל.
 *
 * @param {{ initialMessages?: any[], initialError?: boolean, canRemind?: boolean, viewerName?: string, exactAudience?: boolean }} props
 * exactAudience — הצופה יכול לספור במדויק כמה יקבלו הודעה "לכל המשתמשים" (מנהל כללי: /api/admin/users).
 */
export default function MessagesScreen({ initialMessages, initialError = false, canRemind = false, viewerName, exactAudience = false }) {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [query, setQuery] = useMessagesQuery()
  const refreshFailed = useCallback((error, retry) => {
    toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את ההודעות.', action: { label: 'נסה שוב', onClick: retry } })
  }, [toast])
  const data = useMessagesData({ initialMessages, initialError, onRefreshError: refreshFailed })
  const ready = data.status === 'ready'
  const view = query.view
  const onQuery = useCallback((patch) => setQuery(updateMessagesQuery(query, patch)), [query, setQuery])
  const onPage = useCallback((n) => {
    setQuery(updateMessagesQuery(query, { page: n }), { push: true })
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    document.getElementById(TITLE_ID)?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [query, setQuery])

  // ----- מגירת שיחה (?message=). פתיחה — push, כדי ש"אחורה" יסגור -----
  const { openerRef, open: pushDrawer, close: popDrawer } = useDrawerParam(setQuery)
  const openItem = useCallback((item) => pushDrawer(item.id, updateMessagesQuery(query, { message: item.id })), [query, pushDrawer])
  const closeDrawer = useCallback(() => popDrawer(updateMessagesQuery(query, { message: '' })), [query, popDrawer])
  const returnFocus = useCallback(() => rowButton(openerRef.current || query.message) || document.getElementById(LIST_ID), [openerRef, query.message])
  const openId = view === 'inbox' || view === 'sent' ? query.message : ''

  const onRemovedRef = useRef(null)
  const actions = useMessageActions({
    data: { setData: data.setData, refresh: data.refresh },
    toast,
    confirm,
    onRemoved: useCallback((ids) => onRemovedRef.current?.(ids), []),
  })
  // פעולה מרובה באמצע: יציאה מהמסך (קישור, "אחורה") שואלת, ו"עצור וצא" עוצר אותה
  useBulkLeaveGuard({
    running: actions.progress !== null,
    stop: actions.stopBulk,
    drawerOpen: Boolean(query.message),
    confirm,
    body: 'הפעולה עוד רצה. מה שכבר נשלח נשאר; מה שעוד לא נשלח — לא יישלח.',
  })

  // "סמן כנקרא" שעוד לא אושר בשרת — נשאר "נקרא" גם אם רענון באמצע החזיר "לא נקראה"
  const messages = useMemo(() => withLocalRead(data.messages, actions.localRead), [data.messages, actions.localRead])
  const boxes = useMemo(() => splitBoxes(messages), [messages])
  const groups = useMemo(() => groupSent(boxes.sent, { inbox: boxes.inbox }), [boxes])
  const newCount = unreadCount(boxes.inbox)

  // בחיפוש: כמה נמצאו בכל לשונית (ל"נמצאו גם ב…")
  const found = useMemo(() => (query.q ? {
    inbox: boxes.inbox.filter((m) => matchesSearch(m, query.q)).length,
    sent: groups.filter((g) => groupMatchesSearch(g, query.q)).length,
  } : null), [boxes.inbox, groups, query.q])

  const inboxItem = openId && view === 'inbox' ? boxes.inbox.find((m) => m.id === openId) : null
  const sentItem = openId && view === 'sent' ? groups.find((g) => g.id === openId || g.messages.some((m) => m.id === openId)) : null

  // קישור לשיחה שלא קיימת (נמחקה, או כתובת שגויה)
  const missingShown = useRef(null)
  useEffect(() => {
    if (!ready || !openId || inboxItem || sentItem || missingShown.current === openId) return
    missingShown.current = openId
    toast.show({ tone: 'info', message: 'השיחה לא נמצאה. ייתכן שנמחקה.' })
    setQuery(updateMessagesQuery(query, { message: '' }))
  }, [ready, openId, inboxItem, sentItem, query, setQuery, toast])

  useEffect(() => {
    onRemovedRef.current = (ids) => {
      if (openId && ids.includes(openId)) closeDrawer()
    }
  })

  // ----- תשובה: הטיוטה נשמרת לכל שיחה (גם אם המגירה נסגרה באמצע "שולח…" והשליחה נכשלה) -----
  const drafts = useReplyDrafts()
  const replyLost = useCallback((message, error, name) => {
    toast.show({
      tone: 'error',
      message: `התשובה ל${name} לא נשלחה. ${error?.message || ''}`.trim(),
      action: error?.sessionExpired ? undefined : { label: 'פתח שוב', onClick: () => openItem(message) },
    })
  }, [toast, openItem])

  // ----- הודעה חדשה -----
  const [composing, setComposing] = useState(false)
  const onSent = ({ message, tone = 'success' }) => {
    setComposing(false)
    toast.show({
      tone,
      message,
      action: view === 'sent' || tone !== 'success' ? undefined : { label: 'הצג בנשלחו', href: viewHref('sent') },
    })
    data.refresh()
  }

  // ----- רענון: בנכנסות ובנשלחו — ההודעות; בתזכורות — הספרים וההיסטוריה (RemindersView רושם כאן את שלו) -----
  const remindersRefresh = useRef(null)
  const refreshAll = async () => {
    if (view === 'reminders') {
      remindersRefresh.current?.()
      return
    }
    if (await data.refresh()) toast.show({ message: 'ההודעות עודכנו' })
  }

  const tabs = [
    {
      id: 'inbox', href: viewHref('inbox', query.q), label: 'נכנסות', icon: 'inbox',
      ...(newCount > 0 ? { count: newCount, countLabel: newCountLabel(newCount) } : {}),
    },
    { id: 'sent', href: viewHref('sent', query.q), label: 'נשלחו', icon: 'send' },
    ...(canRemind ? [{ id: 'reminders', href: viewHref('reminders'), label: 'תזכורות', icon: REMINDERS_ICON }] : []),
  ]
  const listView = view === 'inbox' || view === 'sent'
  const refreshLabel = view === 'reminders' ? 'רענן את התזכורות' : 'רענן את ההודעות'

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={MESSAGES_TITLE}
        description={messagesDescription(canRemind)}
        action={(
          <>
            <Button variant={view === 'reminders' ? 'tonal' : 'filled'} size="sm" icon="edit" onClick={() => setComposing(true)}>הודעה חדשה</Button>
            {/* בכל הלשוניות — כך השורה לא משתנה במעבר ביניהן */}
            <Button variant="text" size="sm" icon="refresh" iconOnly aria-label={refreshLabel} title={refreshLabel} onClick={refreshAll} />
          </>
        )}
      />

      <TabLinks label="הלשוניות של ההודעות" activeId={view} items={tabs} />

      {listView && data.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="sr-only">טוען את ההודעות…</p>
          <MessagesListSkeleton view={view} />
        </div>
      )}
      {listView && data.status === 'error' && (
        <LoadError
          error={data.error}
          title="לא הצלחנו לטעון את ההודעות"
          sessionText="התחבר מחדש כדי לראות את ההודעות. אחרי ההתחברות תחזור לכאן."
          onRetry={data.retry}
        />
      )}
      {view === 'inbox' && ready && (
        <InboxView
          messages={boxes.inbox}
          newCount={newCount}
          alsoFound={found?.sent || 0}
          query={query}
          onQuery={onQuery}
          onPage={onPage}
          onOpen={openItem}
          actions={actions}
          listId={LIST_ID}
        />
      )}
      {view === 'sent' && ready && (
        <SentView
          groups={groups}
          alsoFound={found?.inbox || 0}
          query={query}
          onQuery={onQuery}
          onPage={onPage}
          onOpen={openItem}
          onCompose={() => setComposing(true)}
          actions={actions}
          listId={LIST_ID}
        />
      )}
      {view === 'reminders' && (canRemind
        ? <RemindersView confirm={confirm} toast={toast} refreshRef={remindersRefresh} />
        : <ErrorState icon="lock" title="אין לך הרשאה לתזכורות" description="תזכורות שולחים מנהל כללי ומנהל ספרים. אם אתה אמור לראות אותן, פנה למנהל האתר." />)}

      {(inboxItem || sentItem) && (
        <ConversationDrawer
          key={openId}
          message={inboxItem || undefined}
          group={sentItem || undefined}
          actions={actions}
          drafts={drafts}
          onReplyLost={replyLost}
          onClose={closeDrawer}
          returnFocus={returnFocus}
        />
      )}
      {composing && <ComposeDrawer viewerName={viewerName} exactAudience={exactAudience} onClose={() => setComposing(false)} onSent={onSent} />}
      {confirmElement}
    </div>
  )
}
