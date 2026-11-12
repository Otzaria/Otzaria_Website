/**
 * תנאי הלשוניות של מסך תיקוני הטקסט (/library/corrections) — מקור אחד לרשימה עצמה
 * (listReports ב-volunteer.js) ולדשבורד הניהול (adminDashboardData.js), כדי שהמספר בכרטיס
 * יהיה בדיוק מה שהלשונית מציגה, ולא העתק שנסחף ממנה.
 */
import { OPEN_FILTER } from './store.js';

export const PUBLISHING_STATUSES = ['ready', 'in_progress', 'unknown_needs_reconcile', 'pr_opened'];

/**
 * הלשונית "פנויים ובטיפולי": כל מה שפנוי, יחד עם מה שכבר משויך למשתמש.
 * שיוך של משתמש אחר מוסתר כל עוד הוא בתוקף; אחרי שפג הוא זמין שוב ללקיחה.
 * בלי user — רק מה שפנוי לכל מטפל (הדשבורד: "מחכים לבדיקה", בלי מה שכבר בידיים של מישהו).
 * @param {Date} now
 * @param {{ _id: unknown } | null} [user]
 */
export function queuedFilter(now, user = null) {
  return {
    $and: [
      OPEN_FILTER,
      {
        $or: [
          { 'manual.status': { $in: ['queued', 'released'] } },
          ...(user ? [{ 'manual.status': 'claimed', 'manual.assignee': user._id }] : []),
          { 'manual.status': 'claimed', 'manual.leaseExpiresAt': { $lte: now } },
        ],
      },
      // כל שלבי הפרסום (כולל כשל) מוצגים רק בלשונית "אושרו / בפרסום".
      // זה גם מגן על התור אם נתון ישן/חריג נשאר בטעות עם manual.status=claimed.
      { 'publish.status': { $nin: [...PUBLISHING_STATUSES, 'failed'] } },
    ],
  };
}

/** פרסומים שנכשלו — החלק של "כשל" מתוך הלשונית "אושרו / בפרסום" (וגם publishFailed ב-health.js) */
export const failedPublishFilter = () => ({ state: 'open', 'publish.status': 'failed' });

export const LIST_FILTERS = {
  mine: (user) => ({ 'manual.status': 'claimed', 'manual.assignee': user._id }),
  queued: (user, now) => queuedFilter(now, user),
  claimed: () => ({ 'manual.status': 'claimed', state: 'open' }),
  auto: () => ({ state: 'open', 'verification.status': { $in: ['queued', 'in_progress'] } }),
  publishing: () => ({ state: 'open', 'publish.status': { $in: [...PUBLISHING_STATUSES, 'failed'] } }),
  closed: () => ({ state: { $regex: '^closed_' } }),
  // בלי מייל-בלבד (לא נכנסו למערכת) ובלי מה שאושר וממתין לפרסום/מיזוג — אלה בלשונית "אושרו / בפרסום".
  all: () => ({ state: { $ne: 'email_only' }, 'publish.status': { $nin: PUBLISHING_STATUSES } }),
};
