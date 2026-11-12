'use client'

import { useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Ltr from '@/components/ui/Ltr'
import { formatBytes, jobShortId, shortSha } from './ocrJobView'
import { fullDateText } from '@/lib/adminTerms'
import { AdminApiError, send } from '@/components/admin/list/adminRequest'

/**
 * תוצאה מתנגשת אחת של עבודת OCR מקומי (hash שונה שהגיע אחרי נעילת התוצאה), עם כפתור
 * "סמן כנבדק" מול /api/admin/books/ocr/result-conflicts (לפי jobId + sha256), דרך send של list/adminRequest.
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
      const res = await send('/api/admin/books/ocr/result-conflicts', {
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
    } catch (e) {
      // התחברות שפגה / אין חיבור / השרת לא עונה — ההסבר של list/adminRequest
      setError(e instanceof AdminApiError ? e.message : 'תקלה בתקשורת')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-container p-2 text-body-sm leading-snug">
      <div>
        <p className="text-on-surface">
          התקבלה {fullDateText(conflict.receivedAt)}
          {conflict.bytes != null && <> · <Ltr>{formatBytes(conflict.bytes)}</Ltr></>}
        </p>
        <p className="text-label-sm font-normal text-on-surface-variant">
          {showJob && (
            <>
              מעבודה <Ltr className="font-mono">{jobShortId(jobId)}</Ltr>
              {conflict.jobCreatedAt ? ` מ-${fullDateText(conflict.jobCreatedAt)}` : ''}
              {' · '}
            </>
          )}
          <Ltr className="font-mono">{shortSha(conflict.sha256)}</Ltr>
        </p>
        {error && <p role="alert" className="text-label-sm font-normal text-error">{error}</p>}
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
