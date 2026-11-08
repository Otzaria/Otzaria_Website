/**
 * עזרים משותפים לטופסי החלונות של הכרטיסייה (SourceEditModal/OutreachEditModal) —
 * חולצו כי היו משוכפלים זהה בשני הקבצים.
 */

/** תאריך ל-input[type=date] (yyyy-mm-dd) */
export function toDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}
