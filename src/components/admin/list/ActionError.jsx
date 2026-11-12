import { cx } from '@/components/ui/cx'
import { loginHref } from './adminRequest'

/**
 * שגיאת פעולה בכרטיס או בשורה (שורה קטנה, לא Notice). התחברות שפגה — עם קישור "התחבר" שחוזר לאותו מקום.
 * @param {{ error: { text: string, sessionExpired?: boolean } | null, className?: string }} props
 */
export default function ActionError({ error, className }) {
  if (!error?.text) return null
  return (
    <p role="alert" className={cx('text-body-sm text-error', className)}>
      {error.text}
      {error.sessionExpired && <>{' '}<a href={loginHref()} className="underline underline-offset-2">התחבר</a></>}
    </p>
  )
}
