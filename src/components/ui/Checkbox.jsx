'use client'

import { useEffect, useRef } from 'react'
import { cx } from './cx'

/**
 * תיבת סימון לבחירת שורה ברשימה: תיבה native בצבע המותג (20px) בתוך מטרת מגע של 44px — כל
 * הריבוע לחיץ. בלי תווית גלויה: label הוא השם הנגיש ("בחר את חוות דעת").
 * indeterminate — "חלק נבחרו" (בחירה חלקית בקבוצה); קורא המסך שומע "מעורב".
 *
 * @param {{ checked: boolean, indeterminate?: boolean, onChange: (checked: boolean, event: import('react').ChangeEvent<HTMLInputElement>) => void,
 *   label: string, disabled?: boolean, className?: string, id?: string } & Record<string, any>} props
 */
export default function Checkbox({ checked, indeterminate = false, onChange, label, disabled = false, className, id, ...rest }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked
  }, [indeterminate, checked])

  return (
    <label className={cx('flex size-(--touch-target) shrink-0 cursor-pointer items-center justify-center rounded-(--radius-control) hover:bg-surface-selected', disabled && 'cursor-not-allowed opacity-(--button-disabled-opacity)', className)}>
      <input
        {...rest}
        ref={ref}
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked, event)}
        className="size-5 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
    </label>
  )
}
