// ניסוח משותף לארבעת מסכי "אימון מודלים" (עמודים לאימון, תמלול שורות, תיוג מבנה, הגהה) — שמות לפי המילון
// (פנוי / בעבודה / ממתין לאישור / מאושר / דורש בדיקה / הושלם), סוגי כתב, וקריאת הכתובת. לוגיקה טהורה, בלי React
// (נבדק ב-trainingScreens.test.mjs).
import { formatNumber } from '../adminTerms.js'
import { adminScreenTitle } from '../adminNav.js'

/** סוג הכתב — אותם ערכים שהשרת שומר */
export const SCRIPT_TYPES = ['square', 'rashi']
export const SCRIPT_LABELS = { square: 'מרובע', rashi: 'רש״י' }

/** שם סוג הכתב; ערך לא מוכר — מרובע (כמו השרת, שבלי ערך מחזיר square) */
export function scriptLabel(script) {
  return SCRIPT_LABELS[script] || SCRIPT_LABELS.square
}

/**
 * המצבים של הפריטים במסכי האימון לפי המילון. כל מסך ממפה את ערכי השרת שלו (בלי שינוי בשרת):
 *   available → פנוי · in-progress → בעבודה · submitted → ממתין לאישור · approved → מאושר · completed → הושלם ·
 *   flagged (שורה שמתנדב דיווח עליה) → דורש בדיקה.
 */
export const STATUS_LABELS = {
  available: 'פנוי',
  'in-progress': 'בעבודה',
  submitted: 'ממתין לאישור',
  approved: 'מאושר',
  completed: 'הושלם',
  flagged: 'דורש בדיקה',
}
/** שמות קצרים ללשוניות בטלפון (השם הנגיש — תמיד המלא), כדי שארבע הלשוניות של תמלול שורות ייכנסו ב-360 */
export const STATUS_SHORT_LABELS = { submitted: 'לאישור', flagged: 'לבדיקה' }
export const STATUS_TONES = {
  available: 'neutral',
  'in-progress': 'primary',
  submitted: 'warning',
  approved: 'success',
  completed: 'success',
  flagged: 'error',
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.available
}
export function statusTone(status) {
  return STATUS_TONES[status] || 'neutral'
}

/** קריאת פרמטר מהכתובת: URLSearchParams או אובייקט (searchParams של Next) — מחרוזת, בלי רווחים בקצוות */
export function reader(params) {
  return (name) => {
    if (!params) return ''
    const value = typeof params.get === 'function' ? params.get(name) : params[name]
    return String((Array.isArray(value) ? value[0] : value) ?? '').trim()
  }
}

/** ערך מתוך רשימה סגורה; אחרת — ברירת המחדל */
export function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

/** מספר עמוד ברשימה: מספר שלם חיובי; אחרת 1 */
export function pageParam(value) {
  const n = Number.parseInt(value, 10)
  return Number.isInteger(n) && n > 0 ? n : 1
}

/**
 * כתובת מפרמטרים, בסדר קבוע, בלי ערכי ברירת מחדל ("?tab=approved" ולא "?tab=submitted&pool=all").
 * @param {[string, string | number, string | number][]} entries [שם, ערך, ברירת מחדל]
 */
export function serializeParams(entries) {
  const params = new URLSearchParams()
  for (const [name, value, fallback] of entries) {
    if (value !== undefined && value !== null && value !== '' && String(value) !== String(fallback)) params.set(name, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** "שורה אחת" / "12 שורות" */
export function linesCountText(n) {
  return n === 1 ? 'שורה אחת' : `${formatNumber(n)} שורות`
}
/** "עמוד אחד" / "12 עמודים" */
export function pagesCountText(n) {
  return n === 1 ? 'עמוד אחד' : `${formatNumber(n)} עמודים`
}

/** כותרות (מהסרגל — lib/adminNav) ותיאורים של המסכים — גם לשלד הטעינה בדף השרת (לכן כאן, ולא בקובץ של רכיב לקוח) */
export const SCREEN_TEXT = {
  training: {
    title: adminScreenTitle('ocr-training'),
    description: 'עמודים מספרים, שמתנדבים מסמנים בהם שורות ומקלידים אותן — מהשורות האלה המודל לומד לזהות טקסט.',
  },
  lines: {
    title: adminScreenTitle('ocr-lines'),
    description: 'שורות שמתנדבים הקלידו. בדוק שהטקסט תואם לתמונה, ואשר — או שלח להקלדה מחדש.',
  },
  layout: {
    title: adminScreenTitle('ocr-layout'),
    description: 'עמודים שמתנדבים סימנו בהם מספר עמוד, כותרת וחלוקה לטורים. בדוק, ואשר — או שלח לסימון מחדש.',
  },
}

// עבר ל-lib/adminList/selection.js (משותף לכל רשימות הניהול) — מיוצא מכאן גם בשביל הקוראים הקיימים
export { neighborAfterRemove } from '../adminList/selection.js'
