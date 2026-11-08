// הלוגיקה של ui/SelectMenu — טהורה (בלי React ובלי DOM), כדי שאפשר לבדוק אותה בנפרד
// (selectMenuModel.test.js): סינון לפי חיפוש, תקציר הבחירה לכפתור, תנועה בין אפשרויות והקלדה
// לקפיצה (typeahead).
import { normalizeHebrew } from '@/lib/hebrewSearchNormalize.js'

/**
 * @typedef {{ value: string, label: string, count?: number, color?: string, hint?: string, description?: string, disabled?: boolean }} SelectOption
 */

/** הערכים הנבחרים כמערך — גם בבחירה יחידה (null / '' = אין בחירה) */
export function selectedValues(value, multiple) {
  if (multiple) return Array.isArray(value) ? value : []
  return value === null || value === undefined || value === '' ? [] : [value]
}

/**
 * האפשרויות שמתאימות לחיפוש: כל המילים מופיעות בשם (מנורמל — ניקוד, גרשיים ומקפים לא משנים),
 * או ברמז (למשל כתובת הדואר של משתמש). חיפוש ריק — הכול.
 * @param {SelectOption[]} options
 * @param {string} query
 */
export function filterOptions(options, query) {
  const terms = normalizeHebrew(query || '').split(' ').filter(Boolean)
  if (terms.length === 0) return options
  return options.filter((option) => {
    const text = `${normalizeHebrew(option.label)} ${normalizeHebrew(option.hint || '')} ${String(option.hint || '').toLowerCase()}`
    return terms.every((term) => text.includes(term))
  })
}

/**
 * מה כתוב על הכפתור: כלום — placeholder; אחד — שמו; כמה — "הראשון ועוד 2" (הראשון ברשימה).
 * ערך שאין לו אפשרות (נמחק מההגדרות) — הערך עצמו, כדי שהכפתור לא ישקר.
 * @param {SelectOption[]} options
 * @param {string[]} values
 * @param {string} placeholder
 */
export function summaryText(options, values, placeholder) {
  if (values.length === 0) return placeholder
  // לפי סדר הרשימה (ולא סדר הערכים בכתובת) — אותו בחירה, אותו תקציר
  const index = (value) => {
    const i = options.findIndex((o) => o.value === value)
    return i < 0 ? Infinity : i
  }
  const firstValue = [...values].sort((a, b) => index(a) - index(b))[0]
  const first = options.find((o) => o.value === firstValue)?.label ?? firstValue
  return values.length === 1 ? first : `${first} ועוד ${(values.length - 1).toLocaleString('he-IL')}`
}

/**
 * האפשרות הבאה שאפשר לבחור בה, בכיוון delta (1 / -1), בלי לגלוש מהקצה (כמו listbox של ARIA).
 * from = -1 עם delta 1 — הראשונה. אין אפשרות כזו — from.
 * @param {SelectOption[]} options
 * @param {number} from
 * @param {number} delta — 1 / -1, או צעד גדול (PageDown = 10)
 */
export function moveIndex(options, from, delta) {
  const step = delta > 0 ? 1 : -1
  const inRange = (i) => i >= 0 && i < options.length
  const target = Math.min(Math.max(from + delta, 0), options.length - 1)
  // נחת על אפשרות מושבתת — ממשיכים באותו כיוון; אין שם — חוזרים לכיוון הנוכחית (בלי לעבור אותה)
  for (let i = target; inRange(i); i += step) if (!options[i].disabled) return i
  for (let i = target - step; inRange(i) && i !== from; i -= step) if (!options[i].disabled) return i
  return from
}

/** הראשונה / האחרונה שאפשר לבחור בה (-1 אם אין) */
export function edgeIndex(options, last) {
  if (last) {
    for (let i = options.length - 1; i >= 0; i -= 1) if (!options[i].disabled) return i
    return -1
  }
  return options.findIndex((o) => !o.disabled)
}

/**
 * הקלדה לקפיצה: האפשרות הראשונה שהשם שלה מתחיל במה שהוקלד, החל מזו שאחרי הנוכחית (כך שהקשה
 * חוזרת על אותה אות עוברת בין "אבן", "אור", "אמת"). אין — -1.
 * @param {SelectOption[]} options
 * @param {string} buffer
 * @param {number} from
 */
export function typeaheadIndex(options, buffer, from) {
  const needle = normalizeHebrew(buffer)
  if (!needle) return -1
  // אותה אות שוב ושוב — מחזור בין האפשרויות שמתחילות בה
  const repeated = [...needle].every((ch) => ch === needle[0])
  const prefix = repeated ? needle[0] : needle
  const start = repeated ? from + 1 : Math.max(from, 0)
  for (let k = 0; k < options.length; k += 1) {
    const i = (start + k) % options.length
    if (!options[i].disabled && normalizeHebrew(options[i].label).startsWith(prefix)) return i
  }
  return -1
}

/**
 * בחירה בבחירה מרובה: מוסיף או מסיר, ושומר את הסדר של האפשרויות (ולא את סדר הלחיצות) —
 * כך שהכתובת והתקציר יציבים.
 * @param {SelectOption[]} options
 * @param {string[]} values
 * @param {string} value
 */
export function toggleValue(options, values, value) {
  const set = new Set(values)
  if (set.has(value)) set.delete(value)
  else set.add(value)
  const order = new Map(options.map((o, i) => [o.value, i]))
  return [...set].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity))
}
