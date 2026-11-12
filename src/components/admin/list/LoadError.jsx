import Button from '@/components/ui/Button'
import ErrorState from '@/components/ui/ErrorState'
import { loginHref } from './adminRequest'

/** הודעת השגיאה אומרת בדיוק מה שהכותרת אומרת ("לא הצלחנו לטעון את X") — אין טעם להציג אותה פעמיים */
const sameText = (a, b) => String(a || '').replace(/[.\s]+$/u, '').trim() === String(b || '').replace(/[.\s]+$/u, '').trim()

/**
 * טעינה שנכשלה במסך ניהול (כניסה למסך — לא פעולה):
 *   התחברות שפגה — "התחבר" (לא "נסה שוב", שלא יעזור).
 *   אין הרשאה (403) — מנעול, "אין לך הרשאה לראות את המסך הזה" ולמי פונים; בלי ניסיון חוזר.
 *   כל השאר — הכותרת, הסבר (כשהודעת השרת חוזרת על הכותרת — "ייתכן שזו תקלה זמנית") ו"נסה שוב".
 * @param {{ error: any, title: string, sessionText?: string, onRetry?: () => void }} props
 * error — AdminApiError (status, sessionExpired, message). sessionText — מה קורה אחרי ההתחברות.
 */
export default function LoadError({ error, title, sessionText = 'התחבר מחדש, ותחזור לכאן.', onRetry }) {
  if (error?.sessionExpired) {
    return (
      <ErrorState
        title="פג תוקף ההתחברות"
        description={sessionText}
        action={<Button href={loginHref()} variant="filled" size="sm" icon="login">התחבר</Button>}
      />
    )
  }
  if (error?.status === 403) {
    return <ErrorState icon="lock" title="אין לך הרשאה לראות את המסך הזה" description="אם אתה אמור לראות אותו, פנה למנהל האתר." />
  }
  const description = !error?.message || sameText(error.message, title) ? 'ייתכן שזו תקלה זמנית. נסה שוב בעוד רגע.' : error.message
  return <ErrorState title={title} description={description} onRetry={onRetry} />
}
