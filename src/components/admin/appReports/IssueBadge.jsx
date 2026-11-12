import Badge from '@/components/ui/Badge'
import { issueBadge } from '@/lib/adminAppReportsScreen/appReportsTerms'

/**
 * הכרטיס ב-GitHub של הדיווח: "ממתין לפתיחה" (עם השגיאה האחרונה בריחוף), או מספר הכרטיס (קישור, בלשונית חדשה) ומצבו.
 * בלי כרטיס — כלום. linked=false — בלי קישור (כשהשורה כולה כבר לחיצה).
 */
export default function IssueBadge({ report, linked = true }) {
  const issue = issueBadge(report)
  if (!issue) return null
  if (issue.state === 'pending') {
    return <Badge tone="warning"><span title={report.issueError || undefined}>{issue.label}</span></Badge>
  }
  // "כרטיס #1400" — ברור שזה הכרטיס ב-GitHub (והמצב שלידו הוא שלו), לא מצב הדיווח אצלנו
  const number = <>כרטיס <bdi dir="ltr">#{issue.number}</bdi></>
  return (
    <span className="inline-flex items-center gap-2">
      {linked && issue.url ? (
        <a href={issue.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline"
          aria-label={`כרטיס ${issue.number} ב-GitHub (בלשונית חדשה)`}>
          {number}
        </a>
      ) : number}
      <Badge tone={issue.tone}>{issue.label}</Badge>
    </span>
  )
}
