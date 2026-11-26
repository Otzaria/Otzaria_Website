'use client'

import AdminReasonDialog from './AdminReasonDialog'

/** חריגת חירום חד-פעמית ממגבלת 21 הימים — חובה סיבה; החריגה אינה עוקפת שום בדיקה */
export default function EmergencyExceptionDialog({ pluginName, busy, onSubmit, onClose }: {
  pluginName: string
  busy: boolean
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  return (
    <AdminReasonDialog
      title="חריגת חירום"
      subtitle={pluginName}
      fieldId="service-emergency-reason"
      confirmLabel="אשר חריגה"
      confirmIcon="lock_open"
      busy={busy}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <p className="text-body-md text-on-surface">
        החריגה מאפשרת להתחיל בדיקת שירות אחת לפני תום 21 הימים. היא נצרכת בהתחלת הבדיקה, נרשמת עם הסיבה,
        {' '}ואינה עוקפת שום שלב בדיקה. אחרי האישור יש ללחוץ "אשר והתחל בדיקה".
      </p>
    </AdminReasonDialog>
  )
}
