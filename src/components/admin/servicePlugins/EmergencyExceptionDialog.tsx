'use client'

import { useState } from 'react'
import FormField from '@/components/plugins/form/FormField'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { fieldA11yProps, fieldClasses } from '@/components/ui/fieldStyles'

const REASON_MAX = 500

/** חריגת חירום חד-פעמית ממגבלת 21 הימים — חובה סיבה; החריגה אינה עוקפת שום בדיקה */
export default function EmergencyExceptionDialog({ pluginName, busy, onSubmit, onClose }: {
  pluginName: string
  busy: boolean
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  return (
    <Dialog
      title="חריגת חירום"
      subtitle={pluginName}
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" onClick={onClose}>ביטול</Button>
          <Button variant="filled" icon="lock_open" loading={busy} disabled={!trimmed} onClick={() => onSubmit(trimmed)}>
            אשר חריגה
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-body-md text-on-surface">
          החריגה מאפשרת להתחיל בדיקת שירות אחת לפני תום 21 הימים. היא נצרכת בהתחלת הבדיקה, נרשמת עם הסיבה,
          {' '}ואינה עוקפת שום שלב בדיקה. אחרי האישור יש ללחוץ "אשר והתחל בדיקה".
        </p>
        <FormField id="service-emergency-reason" label="סיבה" required hint={`עד ${REASON_MAX} תווים`}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX}
            className={fieldClasses({ kind: 'textarea', className: 'min-h-28' })}
            {...fieldA11yProps('service-emergency-reason', { required: true, hint: true })}
          />
        </FormField>
      </div>
    </Dialog>
  )
}
