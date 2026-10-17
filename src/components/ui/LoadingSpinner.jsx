import Loader, { DEFAULT_LOADER_LABEL } from './Loader'

/** גודל ה-API הישן → גודל המחוון (ui/Loader) */
const SIZE_MAP = { sm: 'md', md: 'lg', lg: 'lg' }

/**
 * LoadingSpinner — עטיפה לאחור סביב ui/Loader (שלוש נקודות עיטור) לאזור טעינה ממורכז.
 * בקוד חדש עדיף להשתמש ב-Loader ישירות.
 *
 * @param {string} message - כיתוב גלוי מתחת למחוון; ריק — בלי כיתוב גלוי (ההכרזה "טוען…" נשארת)
 * @param {'sm'|'md'|'lg'} size - sm → Loader md (32px); md/lg → Loader lg (80px)
 * @param {string} className - מחלקות CSS נוספות (אופציונלי)
 */
export default function LoadingSpinner({
  message = 'טוען...',
  size = 'md',
  className = ''
}) {
  return (
    <div className={`text-center py-20 ${className}`}>
      <Loader
        size={SIZE_MAP[size] ?? 'lg'}
        label={message || DEFAULT_LOADER_LABEL}
        showLabel={Boolean(message)}
      />
    </div>
  )
}
