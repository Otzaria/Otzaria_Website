import { cx } from './cx'

/**
 * גודל המחוון (effects.css → .loader--*):
 *   inline — בגובה 1em (רוחב 1.5em), בתוך כפתור או שורת טקסט — במקום גליף ובגודלו
 *   sm     — 20px, ליד טקסט קטן או בשורת טבלה
 *   md     — 32px, בכרטיס, ברשימה, בדיאלוג
 *   lg     — 80px, בעמוד מלא (עם כיתוב גלוי כברירת מחדל)
 */
const SIZES = {
  inline: 'loader--inline',
  sm: 'loader--sm',
  md: 'loader--md',
  lg: 'loader--lg'
} as const

/** primary — בצבע הראשי (ברירת מחדל מחוץ לכפתור); current — בצבע הטקסט של ההורה (בכפתור) */
const TONES = {
  primary: 'text-primary',
  current: ''
} as const

export type LoaderSize = keyof typeof SIZES
export type LoaderTone = keyof typeof TONES

export const DEFAULT_LOADER_LABEL = 'טוען…'

export type LoaderProps = {
  size?: LoaderSize
  /** הטקסט שמוכרז לקורא מסך (וגם הכיתוב הגלוי, כש-showLabel) */
  label?: string
  /** כיתוב גלוי מתחת לסימן; ברירת המחדל — רק ב-lg */
  showLabel?: boolean
  /** ברירת המחדל: current ב-inline, primary בשאר הגדלים */
  tone?: LoaderTone
  /** דקורטיבי בלבד (aria-hidden, בלי role) — כשההורה כבר מכריז על הטעינה (כפתור עם aria-busy וטקסט "שומר…") */
  decorative?: boolean
  className?: string
}

/**
 * מחוון טעינה של אוצריא — "שלוש נקודות עיטור": שלושה יהלומים, כמו עיטור בין פרקים בספר,
 * נושמים בגל מימין לשמאל. SVG ב-currentColor ו-CSS טהור (effects.css → .loader-*), רק
 * transform ו-opacity; בלי JS ובלי framer-motion, כך שמותר בכל עמוד ציבורי ובכל Server Component.
 * reduced-motion: שלושה יהלומים סטטיים, האמצעי מודגש.
 *
 * נגישות: role="status" + aria-label, ובתוכו הטקסט עצמו (גלוי או sr-only) — כך יש לו שם גם
 * במצב עיון. מחוון שמורכב בתנאי נכנס ל-DOM יחד עם התוכן שלו, ולכן לא כל קורא מסך יכריז עליו
 * כאזור חי; כשההכרזה חיונית — אזור status קבוע בהורה שהטקסט שלו מתמלא. decorative → aria-hidden
 * בלבד. צבע מותאם ב-className → יחד עם tone="current" (cx אינו tailwind-merge).
 */
export default function Loader({
  size = 'md',
  label = DEFAULT_LOADER_LABEL,
  showLabel,
  tone,
  decorative = false,
  className
}: LoaderProps) {
  const resolvedTone = tone ?? (size === 'inline' ? 'current' : 'primary')
  const visibleLabel = !decorative && (showLabel ?? size === 'lg')
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'status', 'aria-label': label }

  return (
    <span {...a11y} className={cx('loader', SIZES[size], TONES[resolvedTone], className)}>
      <svg className="loader-mark" viewBox="0 4 24 16" aria-hidden="true" focusable="false">
        {/* viewBox חתוך לגובה 16 (y 4–20) מתוך רשת ה-24: היהלומים יושבים בשורה, וכך אין שוליים
            ריקים מעל ומתחת שדוחקים את הכיתוב — הסימן ביחס 3:2. כל יהלום מתכווץ סביב מרכזו
            (transform-box: fill-box ב-effects.css) */}
        <path className="loader-dot loader-dot-1" d="M19 9.4L21.6 12 19 14.6 16.4 12Z" />
        <path className="loader-dot loader-dot-2" d="M12 8.8L15.2 12 12 15.2 8.8 12Z" />
        <path className="loader-dot loader-dot-3" d="M5 9.4L7.6 12 5 14.6 2.4 12Z" />
      </svg>
      {!decorative && (
        visibleLabel
          ? <span className="loader-label">{label}</span>
          : <span className="sr-only">{label}</span>
      )}
    </span>
  )
}
