'use client'

import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import MenuButton from '@/components/ui/MenuButton'
import Skeleton from '@/components/ui/Skeleton'
import { formatTimeAgo } from '@/lib/adminMessagesScreen/reminderUtils'
import { fullDateText } from '@/lib/adminTerms'
import { editorsText } from '@/lib/adminMessagesScreen/messageTerms'

/** שורה בהיסטוריה — אותו גובה גם בשלד */
const ROW = 'flex min-h-18 items-center gap-2 py-2.5 ps-3 pe-1'

/**
 * "תזכורות שנשלחו" (לא "נשלחו" — שם הלשונית של ההודעות באתר) — היסטוריית התזכורות (עד 50, מהשרת): הספר, מי שלח, לכמה עורכים ומתי; תג כשנשלחה רק לחלק
 * מהעורכים. ⋮ — "הסר מההיסטוריה" (באדום). טעינה — שלד באותו גובה; ריק — שורת הסבר; שגיאה — "נסה שוב".
 *
 * @param {{ loading: boolean, history: any[], onDelete: (item: any) => void, error?: any, onRetry?: () => void }} props
 */
export default function ReminderHistoryList({ loading, history, onDelete, error, onRetry }) {
  return (
    <section aria-labelledby="reminder-history-title" className="flex min-w-0 flex-col gap-3">
      <h2 id="reminder-history-title" className="text-title-md text-on-surface">תזכורות שנשלחו</h2>
      {loading ? (
        <div aria-busy="true" className="rounded-(--card-radius) bg-surface">
          <p role="status" className="sr-only">טוען היסטוריה…</p>
          <ul aria-hidden="true" className="divide-y divide-outline-variant/60">
            {[0, 1, 2].map((i) => (
              <li key={i} className={ROW}>
                <div className="min-w-0 flex-1">
                  <p className="text-title-sm"><Skeleton shape="text" className="inline-block w-40 align-middle" /></p>
                  <p className="mt-0.5 text-body-sm"><Skeleton shape="text" className="inline-block w-52 align-middle" /></p>
                </div>
                <span className="flex size-(--touch-target) items-center justify-center"><Skeleton shape="circle" className="size-6" /></span>
              </li>
            ))}
          </ul>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-(--card-radius) bg-surface p-4 text-body-sm text-on-surface-variant">
          <span className="min-w-0 flex-1">{error.message || 'לא הצלחנו לטעון את ההיסטוריה.'}</span>
          {onRetry && <Button variant="text" size="sm" icon="refresh" onClick={onRetry}>נסה שוב</Button>}
        </div>
      ) : history.length === 0 ? (
        <p className="rounded-(--card-radius) bg-surface p-4 text-body-sm text-on-surface-variant">עוד לא נשלחו תזכורות.</p>
      ) : (
        <ul className="divide-y divide-outline-variant/60 rounded-(--card-radius) bg-surface">
          {history.map((item) => (
            <li key={item.id} className={ROW}>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-title-sm text-on-surface" title={item.bookName}>{item.bookName}</span>
                  {item.isPartial && <Badge tone="neutral" className="shrink-0">לחלק מהעורכים</Badge>}
                </p>
                <p className="mt-0.5 truncate text-body-sm text-on-surface-variant">
                  {item.adminName}
                  {item.recipientCount > 0 && <> · {editorsText(item.recipientCount)}</>}
                  {' · '}<time dateTime={new Date(item.timestamp).toISOString()} title={fullDateText(item.timestamp)} suppressHydrationWarning>{formatTimeAgo(item.timestamp)}</time>
                </p>
              </div>
              <MenuButton
                label={`פעולות נוספות: ${item.bookName}`}
                items={[{ id: 'delete', icon: 'delete', label: 'הסר מההיסטוריה', danger: true, onSelect: () => onDelete(item) }]}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
