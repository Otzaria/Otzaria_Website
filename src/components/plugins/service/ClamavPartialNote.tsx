import Badge from '@/components/ui/Badge'
import { formatDateWithTime } from '@/lib/formatDate'

/**
 * הערת מנהלים: הבדיקה המשיכה למרות סריקת ClamAV חלקית, באישור ידני. scanned — קבלת ClamAV החלקית כבר נשמרה;
 * אחרת האישור ניתן והבדיקה טרם הגיעה לשלב. לא מוצג לבעלי התוסף (השרת לא שולח להם את הנתון).
 */
export default function ClamavPartialNote({ scanned, reason, grantedAt }: {
  scanned: boolean
  reason: string | null
  grantedAt: string | null
}) {
  return (
    <div role="note" className="flex flex-col items-start gap-1 text-body-sm text-on-surface-variant">
      <Badge tone="warning" size="md" icon="rule">
        {scanned ? 'סריקת ClamAV חלקית — אושרה ידנית' : 'אושר להמשיך למרות סריקת ClamAV חלקית'}
      </Badge>
      {reason ? <p>סיבה: <bdi>{reason}</bdi></p> : null}
      {grantedAt ? <p>אושר {formatDateWithTime(grantedAt)}</p> : null}
    </div>
  )
}
