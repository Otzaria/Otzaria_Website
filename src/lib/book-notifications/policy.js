// לוגיקה טהורה של תור ההודעות על ספרים חדשים (issue #306): סיווג שגיאות SMTP, זמני המתנה
// והגדרות. בלי DB ובלי רשת — הבדיקות ב-policy.test.mjs.

const MINUTE = 60_000;

export const DEFAULT_CONFIG = Object.freeze({
  // כמה מיילים בכל מנה, וכמה זמן בין מנה למנה. ספק המייל חוסם ("short-term recipient limit")
  // כששולחים מאות נמענים ברצף — וזה חוסם גם את שאר המיילים של האתר (איפוס סיסמה וכו').
  batchSize: 40,
  batchIntervalMs: 2 * MINUTE,
  // המתנה אחרי חסימה של הספק / תקלה זמנית; מוכפלת בכל עצירה רצופה עד התקרה
  backoffMs: 15 * MINUTE,
  maxBackoffMs: 2 * 60 * MINUTE,
  // אחרי כך הרבה עצירות — מוותרים (status: failed) במקום לנסות לנצח
  maxDeferrals: 30,
  // נעילת מנה — ארוכה בהרבה ממה שמנה אמורה לקחת, כדי ש-worker שנפל לא יחסום לתמיד
  leaseMs: 10 * MINUTE,
  // שבת / יום טוב: לא שולחים, בודקים שוב בעוד
  holyDayRetryMs: 30 * MINUTE,
});

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** הגדרות מה-env (אופציונלי), עם ברירות המחדל למעלה */
export function readConfig(env = process.env) {
  return {
    ...DEFAULT_CONFIG,
    batchSize: positiveInt(env.BOOK_NOTIFY_BATCH_SIZE, DEFAULT_CONFIG.batchSize),
    batchIntervalMs: positiveInt(env.BOOK_NOTIFY_BATCH_INTERVAL_MS, DEFAULT_CONFIG.batchIntervalMs),
    backoffMs: positiveInt(env.BOOK_NOTIFY_BACKOFF_MS, DEFAULT_CONFIG.backoffMs),
  };
}

const TRANSIENT_CODES = new Set([
  'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'EAUTH', 'ECONNRESET', 'ECONNREFUSED', 'EPROTOCOL', 'ETLS',
]);

const RATE_LIMIT_RE = /recipient limit|rate limit|too many|try again later|throttl|quota|exceeded/i;
// דחייה של התוכן או של החשבון — תפגע בכל הנמענים, לא בנמען הזה דווקא
const ACCOUNT_BLOCK_RE = /spam|blocked|blacklist|policy|not authorized|relay/i;

function responseCodeOf(err) {
  if (Number.isInteger(err?.responseCode)) return err.responseCode;
  const text = String(err?.response || err?.message || '');
  const m = text.match(/\b([245]\d\d)[ -]\d\.\d\.\d/) || text.match(/(?:^|failed: )([245]\d\d)\b/);
  return m ? Number(m[1]) : null;
}

/**
 * מה לעשות עם כשל בשליחה לנמען אחד:
 *  - 'rate_limit' — הספק הגביל אותנו: עוצרים את כל המנה ומחכים.
 *  - 'temporary'  — תקלת חיבור / 4xx / חסימה ברמת החשבון: עוצרים ומחכים, הנמען נשאר בתור.
 *  - 'recipient'  — דחייה קבועה של הנמען הזה בלבד (5xx על התיבה): מדלגים עליו וממשיכים.
 */
export function classifySendError(err) {
  const text = `${err?.response || ''} ${err?.message || ''}`;
  if (RATE_LIMIT_RE.test(text)) return 'rate_limit';
  const code = responseCodeOf(err);
  if (code === 452) return 'rate_limit'; // "too many recipients" / אחסון זמני מלא
  if (code === null || code < 500) return 'temporary';
  if (TRANSIENT_CODES.has(err?.code)) return 'temporary';
  if (ACCOUNT_BLOCK_RE.test(text)) return 'temporary';
  return 'recipient';
}

/** כמה לחכות אחרי העצירה ה-n (1 = הראשונה) */
export function backoffDelayMs(deferrals, config = DEFAULT_CONFIG) {
  const n = Math.max(1, Math.floor(deferrals) || 1);
  return Math.min(config.backoffMs * 2 ** (n - 1), config.maxBackoffMs);
}

/**
 * מה עושים עם הרשומה אחרי מנה.
 * @param {{ remaining: number, deferrals: number, stop: null | 'rate_limit' | 'temporary' }} outcome
 * @returns {{ status: 'queued' | 'done' | 'failed', deferrals: number, delayMs: number | null }}
 */
export function planAfterBatch({ remaining, deferrals, stop }, config = DEFAULT_CONFIG) {
  if (remaining <= 0) return { status: 'done', deferrals, delayMs: null };
  if (stop) {
    const next = deferrals + 1;
    if (next > config.maxDeferrals) return { status: 'failed', deferrals: next, delayMs: null };
    return { status: 'queued', deferrals: next, delayMs: backoffDelayMs(next, config) };
  }
  // מנה שעברה בלי עצירה מאפסת את רצף העצירות
  return { status: 'queued', deferrals: 0, delayMs: config.batchIntervalMs };
}

/** רשימת נמענים בלי כפילויות ובלי ערכים ריקים, בסדר המקורי */
export function uniqueEmails(emails) {
  const seen = new Set();
  const out = [];
  for (const raw of emails || []) {
    const email = typeof raw === 'string' ? raw.trim() : '';
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** תקציר שגיאה ללוג/לרשומה — בלי כתובת הנמען */
export function errorSummary(err) {
  return String(err?.response || err?.message || err || 'unknown error').slice(0, 300);
}
