'use client'

import Ltr from '@/components/ui/Ltr'
import ResultConflictRow from './ResultConflictRow'
import { formatBytes, formatDateTime, rejectionReasonLabel, shortSha } from './ocrJobView'

/**
 * תוצאות של עבודת OCR מקומי שלא הוחלו:
 * - resultConflicts — תוצאה נוספת עם hash שונה שהגיעה אחרי שכבר ננעלה תוצאה. הקובץ נשמר בשרת
 *   עד שמנהל מסמן "נבדק" (reviewedAt); רק אז הניקוי השעתי רשאי למחוק אותו.
 * - resultRejections — קבצי תוצאה שנדחו בקליטה (פגומים / לא תקינים / אחרי סגירה). לבירור בלבד;
 *   נמחקים אוטומטית אחרי 30 יום.
 *
 * @param {{ job: any, onChanged?: () => void }} props
 */
export default function LocalResultIssues({ job, onChanged }) {
  const conflicts = Array.isArray(job.resultConflicts) ? job.resultConflicts : []
  const rejections = Array.isArray(job.resultRejections) ? job.resultRejections : []
  if (conflicts.length === 0 && rejections.length === 0) return null

  return (
    <section aria-label="תוצאות שלא הוחלו" className="space-y-3 rounded-control border border-outline-variant p-3">
      {conflicts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-on-surface">תוצאות מתנגשות ({conflicts.length})</h4>
          <p className="text-xs text-on-surface-variant">
            המחשב המקומי שלח תוצאה נוספת ושונה אחרי שהתוצאה הראשונה כבר התקבלה. היא לא הוחלה, והקובץ
            נשמר בשרת לבדיקה. אחרי סימון &quot;נבדק&quot; הקובץ יימחק בניקוי האוטומטי.
          </p>
          <ul className="space-y-2">
            {conflicts.map((c) => (
              <ResultConflictRow key={c.sha256} jobId={job.id} conflict={c} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      )}

      {rejections.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-on-surface">תוצאות שנדחו ({rejections.length})</h4>
          <ul className="space-y-2">
            {rejections.map((r, i) => (
              <li key={`${r.sha256}-${i}`} className="rounded-control bg-surface-container p-2 text-sm">
                <p className="text-on-surface">{rejectionReasonLabel(r.reason)}</p>
                <p className="text-xs text-on-surface-variant">
                  התקבלה {formatDateTime(r.receivedAt)}
                  {r.bytes != null && <> · <Ltr>{formatBytes(r.bytes)}</Ltr></>}
                  {' · '}
                  <Ltr className="font-mono">{shortSha(r.sha256)}</Ltr>
                </p>
                {r.details && (
                  <p dir="ltr" className="mt-1 whitespace-pre-wrap break-words text-start font-mono text-xs text-on-surface-variant">
                    {r.details}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
