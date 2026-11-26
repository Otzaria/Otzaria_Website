'use client'

import Notice from '@/components/ui/Notice'
import { SKIP_REASONS } from '@/lib/trainingProof/offline/contract'
import { fmt } from '../api'
import { placeOf, reportSummary } from './offlineLinks'

// הדוח אחרי העלאת קובץ-ההחלטות: מה הוחל, מה דולג ולמה, ורשימת הדילוגים (עד 500)
export default function DecisionsReport({ report }) {
  const { head, skips } = reportSummary(report, SKIP_REASONS)
  const list = report.skippedList || []
  return (
    <Notice tone={skips.length ? 'warning' : 'info'} title="הקובץ הוחל" role="status">
      <p data-testid="tp-offline-report">{head}</p>
      {skips.length > 0 && (
        <ul className="mt-1 list-disc ps-5">
          {skips.map((s) => (
            <li key={s.reason}>
              {s.label}: {fmt(s.n)}
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer">הפריטים שדולגו</summary>
          <ul className="mt-1 max-h-64 overflow-y-auto text-body-sm">
            {list.map((x) => (
              <li key={x.id}>
                {placeOf(x) || x.id} — {x.label}
                {x.error ? ` (${x.error})` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Notice>
  )
}
