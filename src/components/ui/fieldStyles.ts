import { cx } from './cx'

/**
 * מראה שדה טקסט / בחירה / תיבת טקסט — מקור אחד לכל האתר (component-tokens.css → --field-*).
 * עד שייבנה ui/TextField (רכיב), שדות משתמשים במחלקות האלה ישירות. לוגיקה טהורה — fieldStyles.test.ts.
 *
 * השפה: מסגרת outline (שדה חייב גבול מזוהה, WCAG 1.4.11), ריחוף כהה יותר, ובפוקוס מסגרת primary
 * בעובי 2px (border + outline פנימי של 1px). שגוי — מסגרת error (ההודעה עצמה בטקסט ליד השדה).
 *
 * size     — md (48px, ברירת מחדל) / lg (56px, שדה חיפוש ראשי).
 * kind     — input / select (סמן יד) / textarea (גבוה, ריפוד אנכי).
 * withIcon — ריפוד ההתחלה גדל לאייקון בצד ההתחלה (חיפוש). trailing — ריפוד הסוף גדל (חץ של select).
 * quiet    — שדה בתוך רשימה שנקראת כמידע (למשל שמות הקטגוריות): בלי מסגרת ובלי רקע במצב רגיל, והמסגרת
 *            מופיעה בריחוף ובפוקוס (ושגיאה — תמיד במסגרת). כך עמוד של שדות לא נראה כמו טופס.
 */
export type FieldSize = 'md' | 'lg'
export type FieldKind = 'input' | 'textarea' | 'select'

const BASE = cx(
  'block w-full rounded-(--field-radius) border text-(--field-fg)',
  'placeholder:text-(--field-placeholder) transition-colors',
  'focus:border-(--field-border-focus) focus:outline-1 focus:-outline-offset-2 focus:outline-(--field-border-focus)',
  'disabled:cursor-not-allowed disabled:opacity-(--button-disabled-opacity) motion-reduce:transition-none'
)

const IDLE = 'border-(--field-border) bg-(--field-bg) hover:border-(--field-border-hover)'
const QUIET = 'border-transparent bg-transparent hover:border-(--field-border) focus:bg-(--field-bg)'
const INVALID = 'border-error bg-(--field-bg)'

const SIZE: Record<FieldSize, { height: string; text: string; plain: string; icon: string; end: string; trailing: string }> = {
  md: { height: 'min-h-(--field-height-md)', text: 'text-body-md', plain: 'ps-4', icon: 'ps-11', end: 'pe-4', trailing: 'pe-11' },
  lg: { height: 'min-h-(--field-height-lg)', text: 'text-body-lg', plain: 'ps-5', icon: 'ps-13', end: 'pe-5', trailing: 'pe-12' }
}

export function fieldClasses({
  size = 'md',
  kind = 'input',
  invalid = false,
  withIcon = false,
  trailing = false,
  quiet = false,
  className
}: {
  size?: FieldSize
  kind?: FieldKind
  invalid?: boolean
  withIcon?: boolean
  trailing?: boolean
  quiet?: boolean
  className?: string
} = {}): string {
  const s = SIZE[size]
  const box = kind === 'textarea' ? 'min-h-40 py-3 leading-relaxed' : cx(s.height, kind === 'select' && 'cursor-pointer')
  return cx(BASE, box, s.text, withIcon ? s.icon : s.plain, trailing ? s.trailing : s.end, invalid ? INVALID : quiet ? QUIET : IDLE, className)
}

/**
 * מיקום אייקון בתוך השדה (אבסולוטי, ממורכז אנכית) — start לחיפוש, end לחץ.
 * השם בלי "icon" בכוונה: check:icons (src/lib/iconFontScan.mjs) סורק מחרוזות בפונקציות ששמן מכיל
 * icon, ו-'start' / 'end' כאן נספרו כשמות אייקונים חסרים — מה שמכשיל את ה-build ב-CI.
 * חשוב: על span עוטף ולא על הגליף — ל-.material-symbols-outlined יש direction: ltr (base.css), ולכן
 * start/end על הגליף עצמו מתהפכים (start-* = שמאל). העוטף יורש rtl מהדף. הגליף בפנים — FIELD_ICON_GLYPH.
 */
export function fieldAdornmentClasses(size: FieldSize = 'md', side: 'start' | 'end' = 'start') {
  const pos = size === 'lg'
    ? (side === 'start' ? 'start-4 text-(length:--field-icon-size-lg)' : 'end-4 text-(length:--field-icon-size-lg)')
    : (side === 'start' ? 'start-3.5 text-(length:--field-icon-size-md)' : 'end-3.5 text-(length:--field-icon-size-md)')
  return cx('pointer-events-none absolute top-1/2 flex -translate-y-1/2 text-on-surface-variant', pos)
}

/** הגליף בתוך העוטף — יורש את הגודל מהעוטף (ה-24px של מחלקת הגופן נדרס) */
export const FIELD_ICON_GLYPH = '[font-size:inherit]'

/** תווית קבועה מעל שדה בטופס */
export const FIELD_LABEL = 'mb-2 block text-label-lg text-on-surface'
/** תווית מעל שדה בסרגל מסננים — קטנה יותר */
export const FIELD_LABEL_COMPACT = 'mb-2 block text-label-md text-on-surface'
/** שורת הסבר מתחת לשדה */
export const FIELD_HINT = 'mt-2 text-body-sm text-on-surface-variant'
/** הודעת שגיאה מתחת לשדה */
export const FIELD_ERROR = 'mt-2 flex items-start gap-1.5 text-body-sm font-semibold text-error'
/** תיבת סימון native בצבע המותג, 20px */
export const CHECKBOX = 'mt-0.5 size-5 shrink-0 cursor-pointer accent-primary'

/** מזהי ההסבר/השגיאה של שדה — ל-aria-describedby */
export function fieldHintId(id: string) { return `${id}-hint` }
export function fieldErrorId(id: string) { return `${id}-error` }

/**
 * מאפייני הנגישות של הפקד: id (לתווית), aria-required, aria-invalid ו-aria-describedby שמצביע על
 * ההסבר והשגיאה שמתחתיו (רק אלה שמוצגים).
 */
export function fieldA11yProps(id: string, { required = false, hint = false, error }: {
  required?: boolean
  hint?: boolean
  error?: string | null
} = {}) {
  const describedBy = [hint && fieldHintId(id), error && fieldErrorId(id)].filter(Boolean).join(' ')
  return {
    id,
    'aria-required': required || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined
  } as const
}
