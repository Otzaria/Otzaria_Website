import Button from './Button'
import Card from './Card'
import IconTile from './IconTile'
import { cx } from './cx'

/**
 * שגיאת טעינה בתוך העמוד (משלים את ui/EmptyState): "לא הצלחנו לטעון את X", הסבר, ו"נסה שוב".
 * אריח טונלי ושקט (cloud_off) — שגיאה זמנית, לא אזעקה; ההודעה עצמה ברורה בטקסט.
 * role="alert" — מוכרז מיד. retrying — הכפתור מציג טעינה (ומושבת עד שהניסיון מסתיים).
 * action — פעולה אחרת במקום "נסה שוב" (למשל "התחבר" כשההתחברות פגה).
 *
 * @param {{ title: string, description?: import('react').ReactNode, onRetry?: () => void,
 *   retrying?: boolean, retryLabel?: string, action?: import('react').ReactNode, icon?: string, className?: string }} props
 */
export default function ErrorState({ title, description, onRetry, retrying = false, retryLabel = 'נסה שוב', action, icon = 'cloud_off', className }) {
  return (
    <Card role="alert" className={cx('flex flex-col items-center px-6 py-12 text-center md:py-16', className)}>
      <IconTile icon={icon} size="lg" />
      <h2 className="mt-5 text-balance text-title-lg text-on-surface">{title}</h2>
      {description && <p className="mt-2 max-w-measure text-balance text-body-md text-on-surface-variant">{description}</p>}
      {(action || onRetry) && (
        <div className="mt-6">
          {action || (
            <Button variant="outlined" size="sm" icon="refresh" loading={retrying} onClick={onRetry}>
              {retrying ? 'טוען…' : retryLabel}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
