// מצבי עבודת OCR (OcrJob.status) — מקור אמת יחיד לקבוצות ולמיפויים.
// מודול טהור: בלי imports בכלל (לא של שרת ולא '@/'), כדי שישמש גם את המודל, גם את
// הראוטים, גם את צד הלקוח (דיאלוג הניהול) וגם טסטי node:test.
//
// gemini/ocrwin משתמשים רק ב-running → completed/failed/cancelled.
// local (עובד מקומי) עובר: preparing (השרת מכין PDF) → queued → running/pausing/
// paused_runner/delivery_pending/needs_attention (לפי דיווחי העובד) → applying (החלת
// תוצאה) → completed/failed/cancelled.

// פעילים — active=true, חוסמים עבודה נוספת לאותו ספר (אינדקס book_active_unique)
export const ACTIVE_STATUSES = Object.freeze([
  'preparing',
  'queued',
  'running',
  'pausing',
  'paused_runner',
  'delivery_pending',
  'needs_attention',
  'applying',
]);

// סופיים — תמיד active=false
export const TERMINAL_STATUSES = Object.freeze(['completed', 'failed', 'cancelled']);

export const ALL_STATUSES = Object.freeze([...ACTIVE_STATUSES, ...TERMINAL_STATUSES]);

// מה שהעובד רואה ב-GET /api/worker/v1/jobs: כל הפעילים חוץ מ-preparing (הקלט עוד לא מוכן)
export const WORKER_VISIBLE_STATUSES = Object.freeze(
  ACTIVE_STATUSES.filter((s) => s !== 'preparing')
);

// ערכי state בדיווח מצב מהעובד (status.schema.json בחוזה השירות — 9 ערכים)
export const REPORT_STATES = Object.freeze([
  'queued',
  'running',
  'pausing',
  'paused_runner',
  'delivery_pending',
  'completed',
  'failed',
  'cancelled',
  'needs_attention',
]);

// דיווחים שממופים לסטטוס זהה. completed/failed/cancelled אינם כאן בכוונה: רק קליטת
// תוצאה (POST result) סוגרת עבודה — דיווח מצב לעולם לא.
const REPORT_TO_STATUS = new Set([
  'queued',
  'running',
  'pausing',
  'paused_runner',
  'delivery_pending',
  'needs_attention',
]);

export function isActiveStatus(status) {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

// state מדיווח העובד → status לשמירה, או null אם הדיווח לא משנה סטטוס
export function statusFromReport(state) {
  return REPORT_TO_STATUS.has(state) ? state : null;
}

// siteState שמוצג לעובד (GET /jobs/{id} ופריטי הרשימה):
// queued | in_progress | closed | cancelled
export function siteStateOf(job) {
  const status = job?.status;
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed' || status === 'failed') return 'closed';
  if (status === 'queued') return 'queued';
  return 'in_progress';
}

// outcome של תוצאה → status סופי
export function terminalStatusForOutcome(outcome) {
  switch (outcome) {
    case 'success':
    case 'partial':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
}

// פילטר "עבודה פעילה" לשאילתות. בתקופת המעבר (לפני הרצת scripts/migrate-ocr-local.mjs)
// לרשומות ישנות אין שדה active — עבודה ישנה ב-running נחשבת פעילה.
export function activeFilter() {
  return { $or: [{ active: true }, { active: { $exists: false }, status: 'running' }] };
}

// תוויות לתצוגה בממשק הניהול (BookOcrDialog, src/components/admin/ocr/ocrJobView.js)
export const STATUS_LABELS_HE = Object.freeze({
  preparing: 'מכין קובץ לעיבוד',
  queued: 'ממתין למחשב המקומי',
  running: 'בעיבוד',
  pausing: 'בהשהיה',
  paused_runner: 'מושהה — GitHub Runner פעיל',
  delivery_pending: 'העיבוד הסתיים — ממתין למסירה',
  needs_attention: 'דורש טיפול במחשב המעבד',
  applying: 'קולט תוצאות לעמודים',
  completed: 'הסתיים',
  failed: 'נכשל',
  cancelled: 'בוטל',
});

// חלון ה"זמין" לתצוגה: השירות פונה לרשימת העבודות כל 15 שניות, כך ששתי דקות בלי פנייה
// אומרות שהמחשב כבוי/מנותק (או שבת — שער השבת חוסם את /api/worker).
export const WORKER_ONLINE_WINDOW_MS = 2 * 60 * 1000;

// זמינות העובד לפי lastSeenAt — לתצוגה בלבד (לעולם לא סיבה לכשל או מחיקה).
// 'never' — העובד מעולם לא פנה; 'online' — פנה בתוך הסף; 'offline' — אחרת.
export function workerAvailability(lastSeenAt, now, thresholdMs) {
  if (lastSeenAt == null) return 'never';
  const seen = lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return 'never';
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return nowMs - seen <= thresholdMs ? 'online' : 'offline';
}
