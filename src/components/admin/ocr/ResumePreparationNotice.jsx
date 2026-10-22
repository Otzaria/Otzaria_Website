'use client'

import Button from '@/components/ui/Button'
import AppIcon from '@/components/ui/AppIcon'

/**
 * הכנת קובץ הקלט של עבודת local נעצרה (תקלה זמנית בשרת / בקשה שנקטעה): אף בקשה לא בונה כרגע
 * את הקובץ. "המשך הכנה" שולח שוב את אותה בקשה (אותו requestId) — השרת ממשיך את אותה עבודה
 * ולא נוצרת עבודה כפולה.
 *
 * @param {{ onResume: () => Promise<void>|void, resuming?: boolean, note?: string }} props
 */
export default function ResumePreparationNotice({ onResume, resuming = false, note = '' }) {
  return (
    <div className="space-y-3 rounded-control border border-outline-variant p-3">
      <p className="flex items-start gap-2 text-sm text-on-surface">
        <AppIcon name="info" className="text-base" />
        <span>
          הכנת קובץ העמודים נעצרה (תקלה זמנית בשרת או בקשה שנקטעה). אפשר להמשיך את אותה בקשה —
          לא תיווצר עבודה כפולה.
        </span>
      </p>
      <Button variant="filled" fullWidth icon="refresh" onClick={onResume} loading={resuming} disabled={resuming}>
        המשך הכנה
      </Button>
      {resuming && note && (
        <p role="status" className="text-xs text-center text-on-surface-variant">{note}</p>
      )}
    </div>
  )
}
