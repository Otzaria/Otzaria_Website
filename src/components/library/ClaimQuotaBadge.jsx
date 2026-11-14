import Badge from '@/components/ui/Badge'
import { hebrewDays } from '@/lib/pageClaimPolicy'

/**
 * מונה העמודים שבטיפול המתנדב מול המכסה (pageClaimPolicy.js), עם הסבר קצר על השחרור האוטומטי.
 * מוצג בדף הספר; לא מוצג למנהלים ובספר אישי (exempt) או כשהספירה לא ידועה.
 * @param {{ policy?: { maxActivePages: number, releaseAfterDays: number, myActivePages: number|null, exempt?: boolean } | null }} props
 */
export default function ClaimQuotaBadge({ policy }) {
  if (!policy || policy.exempt || typeof policy.myActivePages !== 'number') return null
  const { myActivePages: active, maxActivePages: max, releaseAfterDays } = policy
  const full = active >= max

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="claim-quota">
      <Badge tone={full ? 'warning' : 'neutral'} size="md" icon={full ? 'block' : 'edit_note'}>
        {full
          ? `הגעת למכסה: ${active} מתוך ${max} עמודים בטיפולך`
          : `בטיפולך: ${active} מתוך ${max} עמודים`}
      </Badge>
      <span className="text-xs text-on-surface/60">
        {full
          ? 'כדי לתפוס עמוד חדש, סיים או שחרר עמוד קיים.'
          : `עמוד שלא נערך ${hebrewDays(releaseAfterDays)} משתחרר אוטומטית.`}
      </span>
    </div>
  )
}
