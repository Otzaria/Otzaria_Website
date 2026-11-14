'use client'

import Badge from '@/components/ui/Badge'
import SelectMenu from '@/components/ui/SelectMenu'
import { statusLabel, statusTone } from '@/lib/adminTzuratScreen/tzuratTerms'

// מה שנשאר ייחודי ללשוניות של "צורת הדף": תג מצב לפי המילון, בורר מסנן (עם הערך 'all'), ותוצאת apiCall לשגיאה.
// הרכיבים הגנריים עברו: אזור → ui/CardSection, "רענן" → ui/RefreshButton, שגיאה → ui/ErrorNotice, ריק → ui/EmptyText,
// שלד → ui/ListLoading, תיבת סימון → ui/CheckRow, שגיאת פעולה → admin/list/ActionError.

/** תג מצב לפי המילון (lib/adminTzuratScreen/tzuratTerms) */
export function StatusBadge({ kind, status, className }) {
  return <Badge tone={statusTone(kind, status)} className={className}>{statusLabel(kind, status)}</Badge>
}

/** רוחב בורר בסרגל הסינון: בטלפון — כל התא ברשת של שניים בשורה; מ-sm — רוחב קבוע */
export const FILTER_WIDTH = 'w-full min-w-0 sm:w-44'

/**
 * בורר בסרגל הסינון — SelectMenu במקום <select> של הדפדפן. allLabel — אפשרות "הכול" (הערך 'all' כמו קודם).
 * @param {{ label: string, value: string, onChange: (v: string) => void, options: { value: string, label: string }[],
 *   allLabel?: string, className?: string, disabled?: boolean }} props
 */
export function FilterSelect({ label, value, onChange, options, allLabel, className = 'w-44', disabled = false }) {
  if (allLabel) {
    return (
      <SelectMenu label={label} options={options} value={value === 'all' ? '' : value} allLabel={allLabel} placeholder={allLabel}
        onChange={(v) => onChange(v || 'all')} className={className} disabled={disabled} />
    )
  }
  return <SelectMenu label={label} options={options} value={value} onChange={(v) => v && onChange(v)} className={className} disabled={disabled} />
}

/** תוצאת apiCall שנכשלה → השגיאה ל-admin/list/ActionError */
export const actionError = (r) => ({ text: r.error, sessionExpired: !!r.sessionExpired })
