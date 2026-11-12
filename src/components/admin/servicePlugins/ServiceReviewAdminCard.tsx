'use client'

import { useState } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Ltr from '@/components/ui/Ltr'
import { KIND_LABELS, statusMeta } from '@/components/plugins/service/serviceSubmissionLogic'
import { formatDateWithTime } from '@/lib/formatDate'
import { ADMIN_STATUS_LABELS, ERROR_CLASS_LABELS, type AdminAction, type AdminReview } from './servicePluginsAdminLogic'

const ACTION_LABELS: Record<AdminAction, string> = {
  start: 'אשר והתחל בדיקה',
  emergency: 'חריגת חירום (21 יום)',
  retry: 'נסה שוב',
  cancel: 'בטל הגשה',
  rollback: 'חזור לגרסה הקודמת'
}

const ACTION_ICONS: Record<AdminAction, string> = {
  start: 'play_arrow',
  emergency: 'lock_open',
  retry: 'restart_alt',
  cancel: 'cancel',
  rollback: 'undo'
}

const ACTION_VARIANTS = { start: 'filled', emergency: 'tonal', retry: 'tonal', cancel: 'text', rollback: 'outlined' } as const

const NOT_SUBMITTED = ['draft', 'sealing']

/** פרטי התקלה כפי שהשרת כתב אותם (באנגלית) — מאחורי "פרטים טכניים", עם העתקה לאחראי השרת */
function TechnicalDetails({ review }: { review: AdminReview }) {
  const [copied, setCopied] = useState(false)
  const error = review.lastError
  if (!error) return null
  const text = [`תוסף: ${review.pluginName ?? review.pluginId}`, `הגשה: ${review.id}`, `קוד: ${error.code}`, error.message ? `הודעה: ${error.message}` : ''].filter(Boolean).join('\n')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-label-lg">פרטים טכניים</summary>
      <p className="mt-1 [overflow-wrap:anywhere]" dir="ltr">
        <span className="font-mono">{error.code}</span>
        {error.message ? <> — {error.message}</> : null}
      </p>
      <Button variant="text" size="sm" icon={copied ? 'check' : 'content_copy'} onClick={copy} className="mt-1">
        {copied ? 'הועתק' : 'העתק פרטים לאחראי השרת'}
      </Button>
    </details>
  )
}

/** כרטיס הגשה בניהול: מי, מה, מתי, המצב, תקלה אחרונה — והפעולות המותרות */
export default function ServiceReviewAdminCard({ review, actions, busyAction, onAction }: {
  review: AdminReview
  actions: AdminAction[]
  /** הפעולה שרצה כעת על ההגשה הזו */
  busyAction: AdminAction | null
  onAction: (review: AdminReview, action: AdminAction) => void
}) {
  const operatorError = review.status === 'needs_operator' || review.lastError?.class === 'operator'
  const meta = statusMeta(review.status)
  return (
    <Card as="li" padding="md" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/plugins/${review.pluginId}/service`} prefetch={false} className="text-title-md text-primary hover:underline" dir="auto">
            {review.pluginName ?? 'תוסף שנמחק'}
          </Link>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            {KIND_LABELS[review.kind] ?? review.kind} · תוסף <Ltr>{review.pluginVersion}</Ltr>
            {review.serviceVersion ? <> · שירות <Ltr>{review.serviceVersion}</Ltr></> : null}
            {review.ownerName ? <> · מפתח: <bdi>{review.ownerName}</bdi></> : null}
          </p>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            {NOT_SUBMITTED.includes(review.status) ? 'התחיל' : 'הוגש'} {formatDateWithTime(review.createdAt)}
            {review.selectedAt ? <> · אושר לבדיקה {formatDateWithTime(review.selectedAt)}</> : null}
            {review.attempts > 0 ? <> · ניסיונות: {review.attempts}</> : null}
            {review.nextAttemptAt ? <> · ניסיון הבא {formatDateWithTime(review.nextAttemptAt)}</> : null}
          </p>
        </div>
        <Badge tone={meta.tone} size="md" icon={meta.icon}>{ADMIN_STATUS_LABELS[review.status] ?? meta.label}</Badge>
      </div>

      {review.kind === 'service' && review.cooldown?.blocked && review.status === 'pending_admin' && (
        <p className="text-body-sm text-on-surface-variant">
          בדיקת שירות אפשרית פעם ב-21 יום, והתקופה עוד לא נגמרה
          {review.cooldown.nextAllowedAt ? <> (עד {formatDateWithTime(review.cooldown.nextAllowedAt)})</> : null}.
          {review.adminException
            ? ' אושרה חריגה חד-פעמית — היא תנוצל בתחילת הבדיקה.'
            : ' התחלה לפני המועד דורשת חריגת חירום עם סיבה (החריגה לא מדלגת על שום בדיקה).'}
        </p>
      )}

      {operatorError && (
        <div role="note" className="rounded-(--radius-control) bg-warning-container p-3 text-body-sm text-on-warning-container">
          <p>הבדיקה נעצרה בגלל תקלה אצלנו, לא בגלל התוסף. העבר את הפרטים לאחראי השרת, ואחרי התיקון — &quot;נסה שוב&quot;.</p>
          <TechnicalDetails review={review} />
        </div>
      )}

      {!operatorError && review.lastError && !['approved', 'rejected', 'cancelled'].includes(review.status) && (
        <div className="text-body-sm text-on-surface-variant">
          <p>הניסיון הקודם לא הצליח ({ERROR_CLASS_LABELS[review.lastError.class] ?? 'תקלה'}). הבדיקה תנסה שוב לבד.</p>
          <TechnicalDetails review={review} />
        </div>
      )}

      {review.decision !== null && review.status !== 'cancelled' && (
        <p className="text-body-sm text-on-surface-variant">החלטת הבדיקה: {review.decision === 1 ? 'אושר' : 'נדחה (הדוח נשלח למפתח)'}</p>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action}
              variant={ACTION_VARIANTS[action]}
              size="sm"
              icon={ACTION_ICONS[action]}
              loading={busyAction === action}
              disabled={busyAction !== null && busyAction !== action}
              onClick={() => onAction(review, action)}
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      )}
    </Card>
  )
}
