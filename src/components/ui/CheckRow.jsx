'use client'

import { cx } from './cx'

/**
 * תיבת סימון עם טקסט גלוי שגם הוא לחיץ — לטפסים ולחלונות (ui/Checkbox הוא תיבה בלבד, לבחירת שורה ברשימה).
 * מטרת מגע 44px. tone="error" — לבחירה הרסנית (למשל "כל האירועים" בניקוי משוב).
 * @param {{ checked: boolean, onChange: (checked: boolean) => void, children: import('react').ReactNode, disabled?: boolean,
 *   tone?: 'primary' | 'error', 'aria-label'?: string, className?: string }} props
 */
export default function CheckRow({ checked, onChange, children, disabled = false, tone = 'primary', className, ...rest }) {
  return (
    <label className={cx('flex min-h-11 cursor-pointer items-center gap-3 text-on-surface', disabled && 'cursor-not-allowed opacity-(--button-disabled-opacity)', className)}>
      <input {...rest} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className={cx('size-5 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary', tone === 'error' ? 'accent-error' : 'accent-primary')} />
      <span className="min-w-0">{children}</span>
    </label>
  )
}
