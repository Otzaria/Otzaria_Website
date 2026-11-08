import Badge from '@/components/ui/Badge'
import { cx } from '@/components/ui/cx'
import RelativeTime from '@/components/ui/RelativeTime'
import { longTimeText } from '@/lib/adminMessagesScreen/messageTerms'
import { hasBothSides, threadOf } from '@/lib/adminMessagesScreen/conversations'

/**
 * השרשור במגירה: ההודעה ואחריה התשובות, מהראשונה לאחרונה. כל אחת — הכותב (ו"צוות" כשהוא מהצוות), מתי, והטקסט
 * כמו שנכתב (שורות נשמרות). מה שהצוות כתב — במשטח בגוון המותג ועם פס בתחילתו (נבדל גם בכהה, ולא רק בצבע: יש
 * גם התג "צוות"); כשבשיחה שני צדדים — גם מוזח, כדי שרואים במבט מי אמר מה. שרשור של צד אחד — בלי הזחה.
 * @param {{ message: any }} props
 */
export default function ThreadList({ message }) {
  const thread = threadOf(message)
  const indent = hasBothSides(thread)
  return (
    <ol aria-label="השיחה" className="flex flex-col gap-3">
      {thread.map((item) => (
        <li
          key={item.id}
          className={cx(
            'min-w-0 rounded-(--radius-control) p-3 sm:p-4',
            item.fromTeam
              ? cx('border-s-4 border-primary/60 bg-secondary-container/45', indent && 'ms-6 sm:ms-10')
              : cx('bg-surface', indent && 'me-6 sm:me-10')
          )}
        >
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-on-surface-variant">
            <span className="min-w-0 text-label-lg text-on-surface [overflow-wrap:anywhere]">{item.author}</span>
            {item.fromTeam && <Badge tone="primary">צוות</Badge>}
            <span className="ms-auto"><RelativeTime date={item.createdAt} format={longTimeText} /></span>
          </p>
          <p className="mt-2 whitespace-pre-wrap text-body-md text-on-surface [overflow-wrap:anywhere]">{item.content}</p>
        </li>
      ))}
    </ol>
  )
}
