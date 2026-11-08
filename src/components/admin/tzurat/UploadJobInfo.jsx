'use client'

import { formatNumber } from '@/lib/adminTerms'
import { importSummaryParts } from '@/lib/adminTzuratScreen/tzuratTerms'
import { StatusBadge } from './TzuratBits'
import { MAX_ERRORS_SHOWN } from './uploadPlan'

// מצב עבודת הייבוא של העלאה אחת (Upload מ-CONTRACT.md): מונה עמודים / החלטות / תמונות בזמן העיבוד,
// ובסיום — הסיכום (בעברית פשוטה, importSummaryParts) והשגיאות (עד 20 שורות). הסיכום בשורה שקטה (לא תיבה צבעונית), השגיאות בצבע השגיאה.

export default function UploadJobInfo({ upload }) {
  if (!upload) return null
  const p = upload.progress || {}
  const errors = (upload.errors || []).slice(0, MAX_ERRORS_SHOWN)
  const parts = importSummaryParts(upload.summary)
  return (
    <div className="flex flex-col gap-1 text-body-sm" data-testid="upload-job">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="upload" status={upload.status} />
        {(upload.status === 'processing' || upload.status === 'queued' || upload.status === 'done') && (
          <span className="tabular-nums text-on-surface-variant">
            {formatNumber(p.pages)} עמודים · {formatNumber(p.items)} החלטות · {formatNumber(p.images)} תמונות
          </span>
        )}
      </div>
      {parts.length > 0 && (upload.status === 'done' || upload.status === 'failed') && (
        <p className="text-on-surface-variant" data-testid="upload-summary">{parts.join(' · ')}</p>
      )}
      {errors.length > 0 && upload.status === 'failed' && (
        <p className="text-on-surface">החבילה לא תקינה. שלחו את השגיאות שלמטה למי שהכין אותה.</p>
      )}
      {errors.length > 0 && (
        <ul className="list-disc ps-5 text-error" data-testid="upload-errors">
          {errors.map((e, i) => (
            <li key={`${i}:${e}`} className="break-words">{typeof e === 'string' ? e : JSON.stringify(e)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
