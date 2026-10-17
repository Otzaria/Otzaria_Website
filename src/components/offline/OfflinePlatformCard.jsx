import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import { buttonClasses, buttonIconClasses } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'

// ריחוף הכרטיס (group) צובע גם את ה"כפתור" — הוא span, כי הכרטיס כולו הוא הקישור
const GROUP_HOVER = 'group-hover:bg-(--button-filled-bg-hover)'

/**
 * כרטיס הורדה של מערכת אחת: אריח אייקון + שם המערכת בשורה אחת, שורת פרטים, ובתחתית "כפתור"
 * ההורדה לכל רוחב הכרטיס. הכרטיס כולו הוא הקישור (ui/Card href — מטרת מגע גדולה, בלי
 * אלמנט אינטראקטיבי מקונן). שם הקישור — טקסט הכפתור ("הורד ל-Windows", aria-labelledby), והפרטים
 * (דרישות, גודל) — תיאורו (aria-describedby); idPrefix — ייחודי לכרטיס. בדף מוצג כרטיס אחד בלבד
 * (של המערכת שזוהתה), ולכן הוא תמיד מורם ועם כפתור מלא. matched — זו באמת המערכת שזוהתה אצל
 * המבקר: תג "המחשב שלך" (בברירת המחדל — בלי תג, כי זה לא בהכרח המחשב שלו). התג יושב בשורת
 * הכותרת, שגובהה נקבע לפי אריח האייקון — הופעתו לא מזיזה דבר.
 */
export default function OfflinePlatformCard({ href, icon, title, details, actionLabel, idPrefix, matched = false }) {
  return (
    <Card
      href={href}
      tone="raised"
      padding="md"
      className="flex h-full flex-col gap-4"
      aria-labelledby={`${idPrefix}-action`}
      aria-describedby={matched ? `${idPrefix}-badge ${idPrefix}-details` : `${idPrefix}-details`}
    >
      <span className="flex items-center gap-3">
        <IconTile icon={icon} size="md" />
        <span className="min-w-0 flex-1 text-title-lg text-on-surface">{title}</span>
        {matched && <Badge id={`${idPrefix}-badge`} tone="primary" icon="check">המחשב שלך</Badge>}
      </span>
      <span id={`${idPrefix}-details`} className="flex flex-col gap-0.5 text-body-sm text-on-surface-variant">
        {details.map((line, index) => <span key={index}>{line}</span>)}
      </span>
      <span id={`${idPrefix}-action`} className={cx(buttonClasses({ variant: 'filled', fullWidth: true }), GROUP_HOVER, 'mt-auto')}>
        <span aria-hidden="true" className={cx('material-symbols-outlined', buttonIconClasses({ variant: 'filled' }))}>download</span>
        {actionLabel}
      </span>
    </Card>
  )
}
