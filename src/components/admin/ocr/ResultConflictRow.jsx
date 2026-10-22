'use client'

import { useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Ltr from '@/components/ui/Ltr'
import { formatBytes, formatDateTime, jobShortId, shortSha } from './ocrJobView'

/**
 * תוצאה מתנגשת אחת של עבודת OCR מקומי (hash שונה שהגיע אחרי נעילת התוצאה), עם כפתור
 * "סמן כנבדק" מול /api/admin/books/ocr/result-conflicts (לפי jobId + sha256).
 * showJob — מציג גם מאיזו עבודה התוצאה (ברשימה של עבודות קודמות; conflict.jobCreatedAt).
 *
 * @param {{ jobId: string, conflict: any, showJob?: boolean, onChanged?: () => void }} props
 */
export default function ResultConflictRow({ jobId, conflict, showJob = false, onChanged }) {
  const [reviewedAt, setReviewedAt] = useState(conflict.reviewedAt || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const markReviewed = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/books/ocr/result-conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, sha256: conflict.sha256 }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setReviewedAt(data.reviewedAt || new Date().toISOString())
        onChanged?.()
      } else {
        setError(data.error || 'הסימון נכשל')
      }
    } catch {
      setError('תקלה בתקשורת')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-container p-2 text-sm">
      <div>
        <p className="text-on-surface">
          התקבלה {formatDateTime(conflict.receivedAt)}
          {conflict.bytes != null && <> · <Ltr>{formatBytes(conflict.bytes)}</Ltr></>}
        </p>
        <p className="text-xs text-on-surface-variant">
          {showJob && (
            <>
              מעבודה <Ltr className="font-mono">{jobShortId(jobId)}</Ltr>
              {conflict.jobCreatedAt ? ` מ-${formatDateTime(conflict.jobCreatedAt)}` : ''}
              {' · '}
            </>
          )}
          <Ltr className="font-mono">{shortSha(conflict.sha256)}</Ltr>
        </p>
        {error && <p role="alert" className="text-xs text-error">{error}</p>}
      </div>
      {reviewedAt ? (
        <Badge tone="success" icon="check">נבדק</Badge>
      ) : (
        <Button variant="tonal" size="sm" icon="fact_check" onClick={markReviewed} loading={busy}>
          סמן כנבדק
        </Button>
      )}
    </li>
  )
}
