'use client'

import { useId, useState } from 'react'
import { cx } from '@/components/ui/cx'
import { fieldClasses } from '@/components/ui/fieldStyles'

/**
 * "קפוץ לעמוד" — שדה מספר קטן בשורת הכלים (כשנבחר ספר: אז מספר עמוד מזהה שורה אחת). Enter — onJump(מספר);
 * הקורא עובר לעמוד של הרשימה שבו הוא נמצא ומעביר אליו את הפוקוס, או מודיע שאין עמוד כזה.
 * @param {{ onJump: (number: number) => void, disabled?: boolean, className?: string }} props
 */
export default function JumpToPage({ onJump, disabled = false, className }) {
  const id = useId()
  const [value, setValue] = useState('')
  return (
    <form
      role="search"
      aria-label="קפוץ לעמוד"
      className={cx('w-24 shrink-0', className)}
      onSubmit={(event) => {
        event.preventDefault()
        const number = Number.parseInt(value, 10)
        if (Number.isInteger(number) && number > 0) onJump(number)
      }}
    >
      <label htmlFor={id} className="sr-only">קפוץ לעמוד (מספר, ואז Enter)</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder="עמוד…"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        className={fieldClasses({ className: 'tabular-nums' })}
      />
    </form>
  )
}
