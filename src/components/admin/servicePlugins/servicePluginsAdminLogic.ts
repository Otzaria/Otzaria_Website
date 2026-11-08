// לוגיקה טהורה של לשונית "תוספי שירות" בניהול התוספים: מבנה GET /api/service-plugins/admin, קיבוץ
// ההגשות לפי מה שהמנהל צריך לעשות, והפעולות שמותרות לכל הגשה. טסט: servicePluginsAdminLogic.test.ts.

export type AdminAction = 'start' | 'cancel' | 'retry' | 'emergency' | 'rollback'

export interface AdminReview {
  id: string
  pluginId: string
  pluginName: string | null
  kind: 'service' | 'plugin'
  status: string
  pluginVersion: string
  serviceVersion: string | null
  ownerName: string | null
  createdAt: string
  selectedAt: string | null
  attempts: number
  nextAttemptAt: string | null
  lastError: { class: string; code: string; message: string } | null
  decision: 0 | 1 | null
  cooldown: { blocked: boolean; nextAllowedAt: string | null }
  adminException: boolean
  canRollback: boolean
}

export interface AdminResponse {
  control: { quotaPausedUntil: string | null; lock: { reviewId?: string; owner?: string; expiresAt?: string } | null }
  reviews: AdminReview[]
}

const IN_PROGRESS = ['queued', 'running', 'retry_wait', 'waiting_quota']
const TERMINAL = ['approved', 'rejected', 'cancelled']
const NOT_SUBMITTED = ['draft', 'sealing']

export interface AdminGroups {
  pending: AdminReview[]
  operator: AdminReview[]
  inProgress: AdminReview[]
  notSubmitted: AdminReview[]
  finished: AdminReview[]
}

/** ממתינים לבחירה, תקלות תפעוליות (בנפרד), בבדיקה, טיוטות שלא הוגשו, והסתיימו לאחרונה */
export function groupAdminReviews(reviews: AdminReview[]): AdminGroups {
  return {
    pending: reviews.filter((r) => r.status === 'pending_admin'),
    operator: reviews.filter((r) => r.status === 'needs_operator'),
    inProgress: reviews.filter((r) => IN_PROGRESS.includes(r.status)),
    notSubmitted: reviews.filter((r) => NOT_SUBMITTED.includes(r.status)),
    finished: reviews.filter((r) => TERMINAL.includes(r.status))
  }
}

/** בדיקת שירות שממתינה ונחסמת ב-21 הימים — אפשר להתחיל רק עם חריגה חד-פעמית */
export function needsException(review: AdminReview): boolean {
  return review.kind === 'service' && review.status === 'pending_admin' && review.cooldown?.blocked === true && !review.adminException
}

/** חזרה לאחור היא פעולה על התוסף — מוצגת פעם אחת, על ההגשה המאושרת הראשונה (האחרונה) של כל תוסף */
export function rollbackReviewIds(reviews: AdminReview[]): Set<string> {
  const seen = new Set<string>()
  const ids = new Set<string>()
  for (const review of reviews) {
    if (review.status !== 'approved' || !review.canRollback || seen.has(review.pluginId)) continue
    seen.add(review.pluginId)
    ids.add(review.id)
  }
  return ids
}

/** הפעולות שמוצגות להגשה. השרת בודק שוב כל פעולה. */
export function adminActionsFor(review: AdminReview, rollbackIds: Set<string> = new Set()): AdminAction[] {
  const actions: AdminAction[] = []
  if (review.status === 'pending_admin') actions.push(needsException(review) ? 'emergency' : 'start')
  if (review.status === 'needs_operator') actions.push('retry')
  if (!TERMINAL.includes(review.status)) actions.push('cancel')
  if (rollbackIds.has(review.id)) actions.push('rollback')
  return actions
}

/** השהיית תור הסקירה בגלל מכסת Claude — רק כשהמועד עוד לא עבר */
export function quotaPause(control: AdminResponse['control'] | null | undefined, now: Date = new Date()): string | null {
  const until = control?.quotaPausedUntil
  if (!until) return null
  const time = Date.parse(until)
  return Number.isFinite(time) && time > now.getTime() ? until : null
}

export const ERROR_CLASS_LABELS: Record<string, string> = {
  transient: 'תקלה זמנית',
  quota: 'מכסה',
  operator: 'תקלה בשרת הבדיקה',
  validation: 'נתונים לא תקינים'
}

// ---------- לשוניות (מסך התוספים בניהול, תצוגה "תוספי שירות") ----------

export type ServiceTab = 'pending' | 'failed' | 'inProgress' | 'draft' | 'closed'

/**
 * הלשוניות בסדר: מה שמחכה לך קודם. "נעצר בתקלה" — תקלה אצלנו (צריך לפעול); "נדחה" — הבדיקה דחתה את
 * ההגשה (לא צריך לעשות כלום). שני מצבים הפוכים, ולכן שני שמות שונים, ולא "נכשל" לשניהם.
 */
export const SERVICE_TABS: { id: ServiceTab; label: string; shortLabel?: string; group: keyof AdminGroups }[] = [
  { id: 'pending', label: 'ממתין לאישור', shortLabel: 'לאישור', group: 'pending' },
  { id: 'failed', label: 'נעצר בתקלה', shortLabel: 'תקלה', group: 'operator' },
  { id: 'inProgress', label: 'בבדיקה', group: 'inProgress' },
  { id: 'draft', label: 'טיוטה', group: 'notSubmitted' },
  { id: 'closed', label: 'סגור', group: 'finished' }
]

/** שם המצב בניהול, כשהוא שונה מהשם בדף של המפתח (statusMeta) — לפי מילון השמות של הניהול */
export const ADMIN_STATUS_LABELS: Record<string, string> = {
  pending_admin: 'ממתין לאישור',
  needs_operator: 'נעצר בתקלה'
}

/** כמה הגשות מחכות למנהל: ממתינות לבחירה ותקועות בתקלה — המונה של התצוגה בסרגל ובלשונית */
export function serviceAttentionCount(reviews: AdminReview[] | null | undefined): number {
  if (!reviews) return 0
  return reviews.filter((r) => r.status === 'pending_admin' || r.status === 'needs_operator').length
}

/** הלשונית שנפתחת: הראשונה שיש בה משהו (לפי הסדר), ואם הכול ריק — "ממתין לאישור" */
export function defaultServiceTab(groups: AdminGroups): ServiceTab {
  return SERVICE_TABS.find((t) => groups[t.group].length > 0)?.id ?? 'pending'
}
