'use client'

import { useState, type ReactNode } from 'react'
import FormField from '@/components/plugins/form/FormField'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { fieldA11yProps, fieldClasses } from '@/components/ui/fieldStyles'

export const REASON_MAX = 500

/** חלון פעולת מנהל שמחייבת סיבה כתובה (חריגת חירום, המשך למרות סריקה חלקית) — הסיבה נרשמת בשרת */
export default function AdminReasonDialog({ title, subtitle, fieldId, confirmLabel, confirmIcon, busy, onSubmit, onClose, children }: {
  title: string
  subtitle: string
  /** מזהה ייחודי לשדה הסיבה */
  fieldId: string
  confirmLabel: string
  confirmIcon: string
  busy: boolean
  onSubmit: (reason: string) => void
  onClose: () => void
  /** ההסבר שמעל שדה הסיבה */
  children: ReactNode
}) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  return (
    <Dialog
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" onClick={onClose}>ביטול</Button>
          <Button variant="filled" icon={confirmIcon} loading={busy} disabled={!trimmed} onClick={() => onSubmit(trimmed)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {children}
        <FormField id={fieldId} label="סיבה" required hint={`עד ${REASON_MAX} תווים`}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX}
            className={fieldClasses({ kind: 'textarea', className: 'min-h-28' })}
            {...fieldA11yProps(fieldId, { required: true, hint: true })}
          />
        </FormField>
      </div>
    </Dialog>
  )
}
