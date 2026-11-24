'use client'

import AdminReasonDialog from './AdminReasonDialog'

/** המשך הבדיקה למרות סריקת ClamAV חלקית (clamav_incomplete) — חובה סיבה; שאר שלבי הבדיקה רצים כרגיל */
export default function PartialScanDialog({ pluginName, details, busy, onSubmit, onClose, allResults = false }: {
  pluginName: string
  /** הודעת התקלה מהבודק — רשימת הקבצים שלא נסרקו במלואם */
  details: string | null
  busy: boolean
  onSubmit: (reason: string) => void
  onClose: () => void
  allResults?: boolean
}) {
  return (
    <AdminReasonDialog
      title={allResults ? 'המשך למרות תוצאת ClamAV' : 'המשך למרות סריקה חלקית'}
      subtitle={pluginName}
      fieldId="service-partial-scan-reason"
      confirmLabel="המשך בבדיקה"
      confirmIcon="rule"
      busy={busy}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <div role="note" className="rounded-(--radius-control) bg-warning-container p-3 text-body-sm text-on-warning-container">
        <p>
          {allResults
            ? 'האישור מתיר להמשיך בכל תוצאת ClamAV בהגשה זו, גם בזיהוי חתימה חשודה, שגיאת סורק או היעדר סריקה. הוא אינו הופך את התוצאה לנקייה. יש לעיין בפרטים ולתעד את הנימוק.'
            : 'הקבצים שברשימה לא נסרקו במלואם ב-ClamAV (חריגה ממגבלות הסורק).'}
          {' '}הסיבה נשמרת למנהלים בלבד; בדוח למפתח יצוינו תוצאת הסריקה והאישור ללא הסיבה.
        </p>
        <p className="mt-1.5">
          שאר הבדיקה תרוץ כרגיל: השוואה לקובץ ה-Release, אישור הבנייה, VirusTotal וסקירת Claude — וכל ממצא בהם עדיין יחסום.
        </p>
      </div>
      {details ? <p className="whitespace-pre-line text-body-sm text-on-surface [overflow-wrap:anywhere]" dir="auto">{details}</p> : null}
    </AdminReasonDialog>
  )
}
