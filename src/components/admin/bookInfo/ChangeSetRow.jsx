import { memo } from 'react'
import Badge from '@/components/ui/Badge'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import RelativeTime from '@/components/ui/RelativeTime'
import { statusId } from '@/lib/adminBookInfoScreen/bookInfoQuery'
import { explainError, fieldLabel, formatValue, statusInfo } from '@/lib/adminBookInfoScreen/bookInfoTerms'
import PullRequestLink from './PullRequestLink'
import {
  AREA_CHANGES, AREA_ERROR, AREA_LINK, AREA_MAIN, AREA_STATUS, AREA_SUB, AREA_WHO, BOOK_NAME, ROW_GRID, ROW_PADDING,
} from './changeSetRowLayout'

/** תג המצב, וההסבר שלו בריחוף ולקורא המסך */
function StatusBadge({ status }) {
  const info = statusInfo(status)
  return (
    <span title={info.hint} className="inline-flex">
      <Badge tone={info.tone}>{info.label}</Badge>
      <span className="sr-only">. {info.hint}</span>
    </span>
  )
}

/**
 * שורת בקשת מיזוג: הספר והמחבר, השינויים (שדה: ערך חדש), מי הציע ומתי, המצב, ו"פתח ב-GitHub" (צ'יפ שקט).
 * מצב שדורש טיפול (או נכשל) — בשורה משלה מתחת: מה קרה (הסיבה מהשרת בעברית פשוטה) ומה לעשות; הסיבה המקורית
 * (טכנית) — מוסתרת ב"פרטים". "בפתיחה" שנתקע — "תקוע בפתיחה" (statusId).
 * @param {{ row: any }} props
 */
function ChangeSetRow({ row }) {
  const changes = Object.entries(row.changes || {})
  const who = row.submittedBy || 'משתמש'
  const status = statusId(row)
  const todo = statusInfo(status).todo
  const reason = explainError(row.lastError)
  return (
    <li className={cx(ROW_GRID, ROW_PADDING)}>
      <div className={AREA_MAIN}>
        <h3 className={BOOK_NAME}>{row.book || 'ספר בלי שם'}</h3>
        {row.author && <p className="text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{row.author}</p>}
      </div>

      <div className={AREA_SUB}>
        <StatusBadge status={status} />
        <RelativeTime date={row.createdAt} />
        <bdi className="min-w-0 [overflow-wrap:anywhere]"><span aria-hidden="true">· </span>{who}</bdi>
      </div>

      <ul aria-label="השינויים" className={cx(AREA_CHANGES, 'flex flex-col gap-0.5 text-body-sm')}>
        {changes.length === 0 && <li className="text-on-surface-variant">אין פרטים על השינוי</li>}
        {changes.map(([field, value]) => (
          <li key={field} className="min-w-0 [overflow-wrap:anywhere]">
            <span className="text-on-surface-variant">{fieldLabel(field)}: </span>
            <span className="text-on-surface">{formatValue(value)}</span>
          </li>
        ))}
      </ul>

      <div className={AREA_WHO}>
        <bdi className="block truncate text-on-surface" title={who}><span className="sr-only">הציע: </span>{who}</bdi>
        <span className="text-on-surface-variant"><RelativeTime date={row.createdAt} /></span>
      </div>

      <div className={AREA_STATUS}><StatusBadge status={status} /></div>

      <div className={AREA_LINK}><PullRequestLink url={row.prUrl} number={row.prNumber} /></div>

      {(reason || todo) && (
        <div className={cx(AREA_ERROR, 'mt-2 flex flex-col gap-0.5 text-body-sm [overflow-wrap:anywhere]')}>
          {reason && <p className="text-error"><span className="sr-only">מה קרה: </span>{reason.text}</p>}
          {todo && <p className="text-on-surface"><span className="text-on-surface-variant">מה לעשות: </span>{todo}</p>}
          {reason?.raw && (
            <details className="text-on-surface-variant">
              <summary className={cx('w-fit cursor-pointer select-none rounded-(--radius-control) py-1', FOCUS_RING)}>פרטים</summary>
              <p dir="auto">{reason.raw}</p>
            </details>
          )}
        </div>
      )}
    </li>
  )
}

export default memo(ChangeSetRow)

/** כותרות העמודות — רק ברשימה רחבה; aria-hidden (כל תא אומר מה הוא) */
export function ChangeSetColumnsHeader() {
  return (
    <div aria-hidden="true" className={cx(ROW_GRID, ROW_PADDING, 'hidden min-h-11 items-center border-b border-outline-variant/60 py-1 text-label-md text-on-surface-variant @4xl:grid')}>
      <span className="[grid-area:main]">ספר</span>
      <span className="[grid-area:changes]">השינויים</span>
      <span className="[grid-area:who]">הציע</span>
      <span className="[grid-area:status]">מצב</span>
      <span className="[grid-area:link] justify-self-end">בקשת מיזוג</span>
    </div>
  )
}
