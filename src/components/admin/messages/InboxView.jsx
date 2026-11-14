'use client'

import { useCallback, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import { isUnread, matchesSearch } from '@/lib/adminMessagesScreen/conversations'
import { alsoFoundText } from '@/lib/adminMessagesScreen/messageTerms'
import { paginate } from '@/lib/adminMessagesScreen/messagesQuery'
import { toggleIds } from '@/lib/adminList/selection'
import InboxBulkBar from './InboxBulkBar'
import InboxRow from './InboxRow'
import ListPager from '@/components/admin/list/ListPager'
import MessagesFilterBar from './MessagesFilterBar'

/**
 * "נכנסות": חיפוש ו"רק חדשות", שורת הבחירה (סמן כנקרא · מחק לצמיתות, עם התקדמות ו"עצור"), הרשימה ועימוד.
 * בחירה — לפי מזהה, ונשמרת בין עמודים; מה שנכשל בפעולה מרובה נשאר מסומן, והפוקוס חוזר ל"בחר הכול" (או לרשימה).
 * בחיפוש בלי תוצאות כאן — "נמצאו גם בנשלחו" עם קישור (החיפוש עובר איתו).
 *
 * @param {{ messages: any[], newCount: number, alsoFound?: number, query: import('@/lib/adminMessagesScreen/messagesQuery').MessagesQuery,
 *   onQuery: (patch: object) => void, onPage: (page: number) => void, onOpen: (message: any) => void,
 *   actions: ReturnType<typeof import('./useMessageActions').useMessageActions>, listId: string }} props
 */
export default function InboxView({ messages, newCount, alsoFound = 0, query, onQuery, onPage, onOpen, actions, listId }) {
  const [selected, setSelected] = useState(() => new Set())
  const [clearedText, setClearedText] = useState('')
  const selectAllId = `${listId}-select-all`
  const filtered = useMemo(
    () => messages.filter((m) => (!query.onlyNew || isUnread(m)) && matchesSearch(m, query.q)),
    [messages, query.onlyNew, query.q]
  )
  const page = paginate(filtered, query.page)
  const pageIds = page.items.map((m) => m.id)

  // מה שכבר לא ברשימה (נמחק, או עבר) — יוצא מהבחירה
  const present = useMemo(() => new Set(messages.map((m) => m.id)), [messages])
  const selection = useMemo(() => new Set([...selected].filter((id) => present.has(id))), [selected, present])

  const onSelect = useCallback((ids, checked) => {
    setClearedText('')
    setSelected((prev) => toggleIds(prev, ids, checked))
  }, [])
  const clear = useCallback(() => {
    setSelected(new Set())
    setClearedText('הבחירה בוטלה')
  }, [])

  const runBulk = async (action) => {
    const list = messages.filter((m) => selection.has(m.id))
    const left = await actions.bulk(action, list)
    if (left === null) return // ביטול בחלון האישור — הפוקוס חוזר לכפתור מעצמו
    if (left) setSelected(new Set(left))
    // הכפתורים ו"עצור" יצאו מה-DOM — הפוקוס עובר ל"בחר הכול", ואם אין (הרשימה התרוקנה) — לרשימה
    requestAnimationFrame(() => {
      const box = document.getElementById(selectAllId)
      ;(box && !box.disabled ? box : document.getElementById(listId))?.focus()
    })
  }

  const menuFor = (message) => {
    const busy = actions.busy.has(message.id)
    return [
      { id: 'open', icon: 'mail', label: 'פתח', onSelect: () => onOpen(message) },
      ...(isUnread(message) ? [{ id: 'read', icon: 'mark_email_read', label: 'סמן כנקרא', disabled: busy, onSelect: () => actions.markRead(message) }] : []),
      { separator: true, id: 'sep' },
      { id: 'delete', icon: 'delete_forever', label: 'מחק לצמיתות', danger: true, disabled: busy, onSelect: () => actions.remove(message) },
    ]
  }

  const onSearch = useCallback((q) => onQuery({ q }), [onQuery])
  const searching = Boolean(query.q)
  const empty = messages.length === 0 ? 'all' : filtered.length === 0 ? (searching ? 'search' : 'new') : null

  return (
    <div className="flex flex-col gap-4">
      {messages.length > 0 && (
        <MessagesFilterBar
          q={query.q}
          onSearch={onSearch}
          placeholder="חפש בהודעות"
          onlyNew={query.onlyNew}
          newCount={newCount}
          onOnlyNewChange={(onlyNew) => onQuery({ onlyNew })}
        />
      )}

      <section id={listId} tabIndex={-1} aria-label="נכנסות" className="flex min-w-0 flex-col gap-3 outline-none">
        {empty === 'all' && <EmptyState icon="inbox" title="אין פניות" description="כשמשתמש כותב לצוות, הפנייה תופיע כאן." />}
        {empty === 'new' && (
          <EmptyState
            role="status"
            icon="task_alt"
            title="אין הודעות חדשות"
            description="קראת הכול."
            actions={<Button variant="tonal" size="sm" onClick={() => onQuery({ onlyNew: false })}>הצג את כל השיחות</Button>}
          />
        )}
        {empty === 'search' && (
          <EmptyState
            role="status"
            icon="search_off"
            title="לא נמצאו שיחות"
            description={`אין שיחה בנכנסות שמתאימה ל"${query.q}"${query.onlyNew ? ' בין החדשות' : ''}.${alsoFound > 0 ? ` ${alsoFoundText('sent', alsoFound)}.` : ''}`}
            actions={(
              <>
                {alsoFound > 0 && <Button variant="tonal" size="sm" icon="send" onClick={() => onQuery({ view: 'sent' })}>הצג בנשלחו</Button>}
                <Button variant={alsoFound > 0 ? 'text' : 'tonal'} size="sm" icon="filter_alt_off" onClick={() => onQuery({ q: '', onlyNew: false })}>נקה סינון</Button>
              </>
            )}
          />
        )}
        {!empty && (
          <>
            {searching && alsoFound > 0 && (
              <p className="px-1 text-body-sm text-on-surface-variant sm:px-2">
                {alsoFoundText('sent', alsoFound)}.{' '}
                <button type="button" onClick={() => onQuery({ view: 'sent' })} className="text-primary underline">הצג</button>
              </p>
            )}
            <InboxBulkBar
              pageIds={pageIds}
              selected={selection}
              onSelect={onSelect}
              onClear={clear}
              clearedText={clearedText}
              total={filtered.length}
              selectAllId={selectAllId}
              working={actions.progress !== null}
              onBulk={runBulk}
              progress={actions.progress}
              onStop={actions.stopBulk}
            />
            <Card as="div" className="@container overflow-hidden">
              <ul aria-label={query.onlyNew ? 'שיחות חדשות' : 'שיחות'} className="divide-y divide-outline-variant/60">
                {page.items.map((message) => (
                  <InboxRow
                    key={message.id}
                    message={message}
                    selected={selection.has(message.id)}
                    onSelect={onSelect}
                    onOpen={onOpen}
                    onMarkRead={actions.markRead}
                    menuItems={menuFor(message)}
                    busy={actions.busy.has(message.id)}
                  />
                ))}
              </ul>
            </Card>
            <ListPager page={page} onChange={onPage} />
          </>
        )}
      </section>
    </div>
  )
}
