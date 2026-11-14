'use client'

import { useId } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import { FIELD_ICON_GLYPH, FIELD_LABEL_COMPACT, fieldClasses, fieldAdornmentClasses } from '@/components/ui/fieldStyles'

/** אפשרויות המיון בדף "כל התוספים" — הערכים הם SORT_MODES של src/lib/pluginFilter.js */
export const SORT_OPTIONS = [
  { value: 'recommended', label: 'מומלצים' },
  { value: 'newest', label: 'החדשים ביותר' },
  { value: 'updated', label: 'עודכנו לאחרונה' }
] as const

/** בחירת סדר הרשימה — אותו מראה וגובה כמו StatusSelect, כדי לשבת לצידו בשורת המסננים. */
export default function SortSelect({
  value,
  onChange,
  className
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className={FIELD_LABEL_COMPACT}>מיון</label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClasses({ size: 'md', trailing: true, className: 'cursor-pointer appearance-none' })}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <span className={fieldAdornmentClasses('md', 'end')}>
          <AppIcon name="expand_more" className={FIELD_ICON_GLYPH} />
        </span>
      </div>
    </div>
  )
}
