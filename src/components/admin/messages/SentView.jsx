'use client'

import { useCallback, useMemo } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import BulkProgress from '@/components/admin/list/BulkProgress'
import { groupMatchesSearch } from '@/lib/adminMessagesScreen/conversations'
import { alsoFoundText, bulkProgressText, messagesText } from '@/lib/adminMessagesScreen/messageTerms'
import { paginate } from '@/lib/adminMessagesScreen/messagesQuery'
import ListPager from '@/components/admin/list/ListPager'
import MessagesFilterBar from './MessagesFilterBar'
import SentRow from './SentRow'

/**
 * "נשלחו": מה שהצוות שלח ולא נענה — אל מי, נושא, מתי. הודעה לכל המשתמשים בשורה אחת ("40 נמענים"). חיפוש ועימוד;
 * בלי בחירה מרובה. ⋮: פתח · מחק לצמיתות (שידור — התקדמות ו"עצור"). בחיפוש — "נמצאו גם בנכנסות".
 *
 * @param {{ alsoFound?: number, groups: ReturnType<typeof import('@/lib/adminMessagesScreen/conversations').groupSent>, query: any, onQuery: (patch: object) => void, onPage: (page: number) => void,
 *   onOpen: (group: any) => void, onCompose: () => void,
 *   actions: ReturnType<typeof import('./useMessageActions').useMessageActions>, listId: string }} props
 */
export default function SentView({ groups, alsoFound = 0, query, onQuery, onPage, onOpen, onCompose, actions, listId }) {
  const filtered = useMemo(() => groups.filter((g) => groupMatchesSearch(g, query.q)), [groups, query.q])
  const page = paginate(filtered, query.page)
  const onSearch = useCallback((q) => onQuery({ q }), [onQuery])

  const menuFor = (group) => {
    const busy = group.messages.some((m) => actions.busy.has(m.id))
    return [
      { id: 'open', icon: 'mail', label: 'פתח', onSelect: () => onOpen(group) },
      { separator: true, id: 'sep' },
      { id: 'delete', icon: 'delete_forever', label: 'מחק לצמיתות', danger: true, disabled: busy || actions.progress !== null, onSelect: () => actions.removeSent(group) },
    ]
  }

  const empty = groups.length === 0 ? 'all' : filtered.length === 0 ? 'search' : null
  return (
    <div className="flex flex-col gap-4">
      {groups.length > 0 && <MessagesFilterBar q={query.q} onSearch={onSearch} placeholder="חפש בהודעות" />}
      <section id={listId} tabIndex={-1} aria-label="נשלחו" className="flex min-w-0 flex-col gap-3 outline-none">
        {empty === 'all' && (
          <EmptyState
            icon="send"
            title="עוד לא נשלחו הודעות"
            description="הודעה שהצוות שולח למשתמש, או לכל המשתמשים, תופיע כאן."
            actions={<Button variant="tonal" size="sm" icon="edit" onClick={onCompose}>הודעה חדשה</Button>}
          />
        )}
        {empty === 'search' && (
          <EmptyState
            role="status"
            icon="search_off"
            title="לא נמצאו הודעות"
            description={`אין הודעה בנשלחו שמתאימה ל"${query.q}".${alsoFound > 0 ? ` ${alsoFoundText('inbox', alsoFound)}.` : ''}`}
            actions={(
              <>
                {alsoFound > 0 && <Button variant="tonal" size="sm" icon="inbox" onClick={() => onQuery({ view: 'inbox' })}>הצג בנכנסות</Button>}
                <Button variant={alsoFound > 0 ? 'text' : 'tonal'} size="sm" icon="filter_alt_off" onClick={() => onQuery({ q: '' })}>נקה חיפוש</Button>
              </>
            )}
          />
        )}
        {!empty && (
          <>
            {query.q && alsoFound > 0 && (
              <p className="px-1 text-body-sm text-on-surface-variant sm:px-2">
                {alsoFoundText('inbox', alsoFound)}.{' '}
                <button type="button" onClick={() => onQuery({ view: 'inbox' })} className="text-primary underline">הצג</button>
              </p>
            )}
            <div className="flex min-h-14 items-center gap-2 px-1 sm:px-2">
              <p role="status" className="min-w-0 flex-1 text-body-sm tabular-nums text-on-surface-variant">{messagesText(filtered.length)}</p>
              {actions.progress && (
                <BulkProgress text={bulkProgressText(actions.progress.action, actions.progress)} value={actions.progress.done} max={actions.progress.total} onStop={actions.stopBulk} focusStop />
              )}
            </div>
            <Card as="div" className="@container overflow-hidden">
              <ul aria-label="הודעות שנשלחו" className="divide-y divide-outline-variant/60">
                {page.items.map((group) => (
                  <SentRow key={group.id} group={group} onOpen={onOpen} menuItems={menuFor(group)} busy={group.messages.some((m) => actions.busy.has(m.id))} />
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
