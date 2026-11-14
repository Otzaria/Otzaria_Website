// מסנני הסקירה (זיהוי טקסט ונתב הכתב) — לוגיקה טהורה: מה מסונן כרגע (למונה "סינון (2)" ולשורת "מסונן: …"
// בטלפון), וניקוי. def: { key, label, options: {value,label}[], empty?, allLabel? } — empty הוא הערך שאינו
// סינון ('' = "הכול"; במצב — 'submitted').

export const STATUS_OPTIONS = [
  { value: 'submitted', label: 'ממתינות לאישור' },
  { value: 'approved', label: 'אושרו (עוד לא הורדו)' },
]

const emptyOf = (def) => def.empty ?? ''

/** הבוררים שיש בהם סינון, עם תווית הערך שנבחר */
export function activeFilters(filters, defs) {
  return defs
    .filter((d) => (filters[d.key] ?? emptyOf(d)) !== emptyOf(d))
    .map((d) => ({ key: d.key, label: d.options.find((o) => o.value === filters[d.key])?.label ?? String(filters[d.key]) }))
}

/** מה ש-admin/list/FilterBar צריך: count, summary, active */
export function filterBarState(filters, defs) {
  const on = activeFilters(filters, defs)
  return { count: on.length, summary: on.map((x) => x.label), active: on.length > 0 }
}

/** "נקה סינון": כל בורר חוזר לערך שאינו סינון; שאר השדות (למשל המיון) נשארים */
export function clearedFilters(filters, defs) {
  return { ...filters, ...Object.fromEntries(defs.map((d) => [d.key, emptyOf(d)])) }
}

/**
 * מה כתוב כשאין שורות: יש סינון (חוץ מהמצב) — "אין שורות שמתאימות לסינון" ו"נקה סינון" (המצב נשאר);
 * בלי סינון — התור פשוט ריק, וזו בשורה טובה ולא "נסה מסנן אחר".
 * @returns {{ title: string, description?: string, canClear: boolean }}
 */
export function emptyView(filters, defs) {
  const others = activeFilters(filters, defs).filter((x) => x.key !== 'status')
  if (others.length) return { title: 'אין שורות שמתאימות לסינון', description: 'אפשר לנקות את הסינון ולראות את כל השורות.', canClear: true }
  if (filters.status === 'approved') return { title: 'אין שורות שאושרו וממתינות להורדה', canClear: false }
  return { title: 'הכול אושר — אין שורות שממתינות לאישור', canClear: false }
}

/** "נקה סינון" מתוך הרשימה הריקה: כל הבוררים חוזרים לערך שאינו סינון, חוץ מהמצב (התצוגה נשארת) */
export function clearedKeepStatus(filters, defs) {
  return { ...clearedFilters(filters, defs), status: filters.status }
}
