'use client'

import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Ltr from '@/components/ui/Ltr'
import { formatDateWithTime } from '@/lib/formatDate'
import ServiceStatusBadge from './ServiceStatusBadge'
import ServiceReport from './ServiceReport'
import { KIND_LABELS, OWNER_CANCELLABLE, type ManageReview } from './serviceSubmissionLogic'

/** הסבר קצר למצב שדורש הבהרה לבעלים (לא תוסף שנדחה — הדוח מסביר את זה) */
function statusExplanation(review: ManageReview): string | null {
  if (review.status === 'draft') return 'ההעלאה לא הושלמה. טיוטה לא גמורה מתבטלת אחרי 24 שעות; לתיקון — בטלו והגישו מחדש.'
  if (review.status === 'pending_admin') return 'ההגשה הוקפאה וממתינה שמנהל יבחר בה ויתחיל את הבדיקה.'
  if (review.status === 'needs_operator' || review.lastErrorClass === 'operator') {
    return 'תקלה תפעולית בשרת הבדיקה — זו אינה דחייה. צוות האתר יטפל בה והבדיקה תמשיך.'
  }
  if (review.status === 'waiting_quota') return 'הבדיקה ממתינה לחידוש מכסת הסקירה ותמשיך אוטומטית.'
  if (review.status === 'retry_wait') return 'תקלה זמנית — הבדיקה תנסה שוב אוטומטית.'
  return null
}

export default function ServiceReviewItem({ review, onCancel, cancelling }: {
  review: ManageReview
  /** בלי פעולה (צפיית מנהל) — הכפתור לא מוצג */
  onCancel?: (review: ManageReview) => void
  cancelling: boolean
}) {
  const explanation = statusExplanation(review)
  const declared = review.kind === 'service' ? 1 + review.assets.length : 1
  const received = Object.values(review.uploads || {}).filter(Boolean).length
  return (
    <Card as="li" tone="raised" padding="md" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-title-sm text-on-surface">{KIND_LABELS[review.kind] ?? review.kind}</p>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            תוסף <Ltr>{review.pluginVersion}</Ltr>
            {review.serviceVersion ? <> · שירות <Ltr>{review.serviceVersion}</Ltr></> : null}
            {' '}· הוגש <Ltr>{formatDateWithTime(review.createdAt)}</Ltr>
          </p>
        </div>
        <ServiceStatusBadge status={review.status} size="md" />
      </div>

      {explanation && <p className="text-body-sm text-on-surface-variant">{explanation}</p>}

      {review.lastErrorMessage && (
        <p className="whitespace-pre-wrap text-body-sm text-error" dir="auto">{review.lastErrorMessage}</p>
      )}

      {review.status === 'draft' && (
        <p className="text-body-sm text-on-surface-variant">
          קבצים שהתקבלו: <Ltr>{`${received}/${declared}`}</Ltr>
        </p>
      )}

      {review.report && <ServiceReport decision={review.decision} report={review.report} />}

      {onCancel && OWNER_CANCELLABLE.includes(review.status) && (
        <div>
          <Button variant="outlined" size="sm" icon="cancel" loading={cancelling} onClick={() => onCancel(review)}>
            ביטול ההגשה
          </Button>
        </div>
      )}
    </Card>
  )
}
