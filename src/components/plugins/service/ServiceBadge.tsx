import Badge, { type BadgeSize } from '@/components/ui/Badge'

export const SERVICE_BADGE_LABEL = 'דורש שירות חיצוני'

/** סימון תוסף שפועל מול תוכנה חיצונית המותקנת במחשב — בכרטיס, בשורת חיפוש ובעמוד התוסף */
export default function ServiceBadge({ size = 'sm', className }: { size?: BadgeSize; className?: string }) {
  return (
    <Badge tone="info" size={size} icon="memory" className={className}>
      {SERVICE_BADGE_LABEL}
    </Badge>
  )
}
