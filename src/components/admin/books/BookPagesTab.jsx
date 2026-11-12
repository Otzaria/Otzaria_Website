'use client'

import Link from 'next/link'
import Button from '@/components/ui/Button'
import ErrorState from '@/components/ui/ErrorState'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import RelativeTime from '@/components/ui/RelativeTime'
import { loginHref } from '@/components/admin/list/adminRequest'
import { formatNumber } from '@/lib/adminBooks/bookTerms'
import { libraryHref } from './bookRowActions'

// כמו בלשונית "פרטים" — ברבים (ספירה של עמודים)
const STATUS_LABEL = { available: 'פנויים', 'in-progress': 'בעבודה', completed: 'הושלמו' }

/** "עמוד 12" — מספר עמוד שמגיע מהשרת */
function pageLabel(n) {
  return `עמוד ${formatNumber(n)}`
}

/**
 * לשונית "עמודים" במגירת הספר: כמה עמודים בכל מצב, ומי עובד עכשיו על אילו עמודים (עם קישור לעמוד
 * בעורך). הרשימה המלאה של העמודים — בדף הספר בספרייה ("כל העמודים"), שזמין לכל שלושת התפקידים.
 * (מסך "עמודים" של הניהול לא יודע עדיין לקבל ספר בכתובת, ולמנהל ספרים-בלבד אין אליו גישה — לכן לא
 * מקשרים אליו מכאן.)
 * @param {{ book: any, details: ReturnType<typeof import('./useBookDetails').useBookDetails> }} props
 */
export default function BookPagesTab({ book, details }) {
  if (details.status === 'error') {
    return details.error?.sessionExpired ? (
      <ErrorState title="פג תוקף ההתחברות" description="התחבר מחדש כדי לראות את העמודים." action={<Button href={loginHref()} variant="filled" size="sm" icon="login">התחבר</Button>} />
    ) : (
      <ErrorState title="לא הצלחנו לטעון את העמודים" description={details.error?.message} onRetry={details.retry} />
    )
  }
  if (details.status !== 'ready') {
    return (
      <div aria-busy="true" className="flex flex-col gap-3">
        <p role="status" className="sr-only">טוען את העמודים…</p>
        <Skeleton className="h-16 w-full" />
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }

  const pages = details.data.pages
  const counts = { available: 0, 'in-progress': 0, completed: 0 }
  for (const page of pages) if (page.status in counts) counts[page.status]++
  const working = pages.filter((p) => p.status === 'in-progress')
    .sort((a, b) => (Date.parse(a.claimedAt || '') || 0) - (Date.parse(b.claimedAt || '') || 0))

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-3 gap-2 rounded-(--radius-control) bg-surface p-3 text-center">
        {['completed', 'in-progress', 'available'].map((status) => (
          <div key={status}>
            <dt className="text-label-md text-on-surface-variant">{STATUS_LABEL[status]}</dt>
            <dd className="text-title-md tabular-nums text-on-surface">{formatNumber(counts[status])}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="book-working-title" className="flex flex-col gap-3">
        <h3 id="book-working-title" className="text-title-sm text-on-surface">
          בעבודה עכשיו {working.length > 0 && <span className="text-on-surface-variant tabular-nums">({formatNumber(working.length)})</span>}
        </h3>
        {working.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">אף אחד לא עובד עכשיו על עמודים בספר.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant/60 rounded-(--radius-control) bg-surface">
            {working.map((page) => (
              <li key={page.id} className="flex items-center gap-3 px-3 py-2">
                <Link
                  href={`${libraryHref(book)}/${page.number}`}
                  prefetch={false}
                  className={cx('min-w-16 shrink-0 rounded-(--radius-control) text-label-lg text-primary underline-offset-2 hover:underline', FOCUS_RING)}
                >
                  {pageLabel(page.number)}
                </Link>
                <span className="min-w-0 flex-1 truncate text-body-md text-on-surface">{page.claimedBy || 'משתמש לא ידוע'}</span>
                {page.claimedAt && <span className="shrink-0 text-body-sm text-on-surface-variant"><RelativeTime date={page.claimedAt} /></span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant pt-4">
        <p className="min-w-0 flex-1 text-body-sm text-on-surface-variant">כל {formatNumber(pages.length)} העמודים, עם המצב של כל אחד — בדף הספר.</p>
        <Button variant="outlined" size="sm" icon="open_in_new" href={libraryHref(book)}>כל העמודים</Button>
      </div>
    </div>
  )
}
