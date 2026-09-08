/**
 * עזרים משותפים לטופסי המודאלים של הכרטיסייה (SourceEditModal/OutreachEditModal) —
 * חולצו כי היו משוכפלים זהה בשני הקבצים.
 */

/** תאריך ל-input[type=date] (yyyy-mm-dd) */
export function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export const inputClass =
  'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary'
