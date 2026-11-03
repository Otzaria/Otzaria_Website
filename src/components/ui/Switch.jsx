'use client'

import { useId } from 'react'
import { cx } from './cx'
import { FOCUS_RING } from './focusRing'

/**
 * מתג הפעלה/כיבוי (role="switch"). כל השורה — התווית, ההסבר והמתג — היא מטרת הלחיצה
 * (לפחות 44px גובה). התווית היא השם הנגיש, וההסבר מחובר ב-aria-describedby.
 * המצב אינו מועבר בצבע בלבד: הידית זזה לצד השני, והמסלול הפעיל מלא.
 *
 * @param {{ checked: boolean, onChange: (next: boolean) => void, label: import('react').ReactNode,
 *   description?: import('react').ReactNode, disabled?: boolean, className?: string }} props
 */
export default function Switch({ checked, onChange, label, description, disabled = false, className }) {
  const labelId = useId()
  const descId = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'flex min-h-(--touch-target) w-full items-center justify-between gap-4 rounded-(--radius-control) py-1.5 text-start',
        'disabled:cursor-not-allowed disabled:opacity-(--button-disabled-opacity)',
        FOCUS_RING,
        className
      )}
    >
      <span className="min-w-0">
        <span id={labelId} className="block text-body-md text-on-surface">{label}</span>
        {description && <span id={descId} className="block text-body-sm text-on-surface-variant">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-(--radius-pill) border-2 transition-colors motion-reduce:transition-none',
          checked ? 'border-primary bg-primary' : 'border-outline bg-surface-container-highest'
        )}
      >
        <span
          className={cx(
            'absolute top-1/2 size-4 -translate-y-1/2 rounded-(--radius-pill) transition-[inset-inline-start] duration-(--motion-duration-fast) motion-reduce:transition-none',
            checked ? 'start-[calc(100%-1.125rem)] bg-on-primary' : 'start-0.5 bg-outline'
          )}
        />
      </span>
    </button>
  )
}
