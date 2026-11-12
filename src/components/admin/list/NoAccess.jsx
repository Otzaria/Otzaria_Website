import Button from '@/components/ui/Button'
import ErrorState from '@/components/ui/ErrorState'

/**
 * מסך ניהול שהצופה לא רשאי לראות (בלי סרגל — אין לו אף פריט): "אין לך הרשאה למסך הזה" וקישור לאזור
 * האישי. למסכים שה-proxy מתיר לכל מחובר, והאכיפה בהם ב-API (מרחב העריכה).
 * description — למי המסך פתוח, ולמי פונים.
 * @param {{ description?: string }} props
 */
export default function NoAccess({ description }) {
  return (
    <ErrorState
      icon="lock"
      title="אין לך הרשאה למסך הזה"
      description={description}
      action={<Button href="/library/dashboard" variant="tonal" size="sm">חזרה לאזור האישי</Button>}
    />
  )
}
