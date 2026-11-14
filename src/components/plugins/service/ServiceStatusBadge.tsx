import Badge, { type BadgeSize } from '@/components/ui/Badge'
import { statusMeta } from './serviceSubmissionLogic'

/** מצב הגשת שירות (טיוטה, ממתין לבחירת מנהל, בבדיקה...) — משותף לדף ההגשה ולניהול */
export default function ServiceStatusBadge({ status, size = 'sm', className }: { status: string; size?: BadgeSize; className?: string }) {
  const meta = statusMeta(status)
  return (
    <Badge tone={meta.tone} size={size} icon={meta.icon} className={className}>
      {meta.label}
    </Badge>
  )
}
