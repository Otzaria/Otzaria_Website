// לוגיקה טהורה ליצירת עבודת OCR מקומית (method=local) — ולידציה של הבקשה, fingerprint,
// ומיפוי שגיאות קלט לתגובות HTTP. בלי DB/fs/network; imports יחסיים בלבד (node:test).
import { createHash } from 'node:crypto';

// הלקוח שולח crypto.randomUUID() — אבל כל מזהה בטוח באורך סביר מתקבל
export const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

// whitelist לפי job-envelope.schema.json בחוזה השירות (options: additionalProperties=false)
export const LOCAL_OPTION_VALUES = Object.freeze({
  lm: Object.freeze(['rabbinic', 'modern', 'off']),
  defaultScript: Object.freeze(['square', 'rashi']),
});
export const DEFAULT_LOCAL_OPTIONS = Object.freeze({ lm: 'rabbinic', defaultScript: 'square' });

const MODES = ['overwrite', 'skip'];

// משך ה-lease של הכנת הקלט (בקשה שמחזיקה אותו בונה את ה-PDF), ומתי הכנה שה-lease שלה פג
// נחשבת נטושה ומפנה את הספר לבקשה חדשה (החלטה פתוחה 14 בתוכנית).
export const PREP_LEASE_MS = 10 * 60 * 1000;
export const PREP_ABANDONED_AFTER_MS = 15 * 60 * 1000;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * ולידציה ונרמול של שדות ה-local בבקשת start.
 * @returns {{ok:true, value:{requestId:string, existingTextMode:string, options:{lm:string, defaultScript:string}}}
 *   | {ok:false, error:string, code:string}} הודעות בעברית
 */
export function normalizeLocalRequest(body) {
  const b = isPlainObject(body) ? body : {};
  const { requestId, existingTextMode, splitColumns, options } = b;

  if (requestId === undefined || requestId === null || requestId === '') {
    return { ok: false, code: 'missing_request_id', error: 'חסר מזהה בקשה' };
  }
  if (typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId)) {
    return { ok: false, code: 'invalid_request_id', error: 'מזהה הבקשה אינו תקין' };
  }
  if (!MODES.includes(existingTextMode)) {
    return { ok: false, code: 'invalid_mode', error: 'בחירת טיפול בעמודים ערוכים לא חוקית' };
  }
  if (splitColumns === true) {
    return { ok: false, code: 'split_columns_unsupported', error: 'חלוקה לטורים אינה נתמכת בעיבוד במחשב המקומי' };
  }
  if (splitColumns !== undefined && splitColumns !== null && splitColumns !== false) {
    return { ok: false, code: 'invalid_split_columns', error: 'ערך חלוקה לטורים לא תקין' };
  }

  if (options !== undefined && options !== null && !isPlainObject(options)) {
    return { ok: false, code: 'invalid_options', error: 'הגדרות העיבוד אינן תקינות' };
  }
  const opts = options || {};
  const unknown = Object.keys(opts).filter((k) => !Object.hasOwn(LOCAL_OPTION_VALUES, k));
  if (unknown.length) {
    return { ok: false, code: 'invalid_options', error: 'הגדרת עיבוד לא מוכרת' };
  }
  const normalized = {};
  for (const [key, allowed] of Object.entries(LOCAL_OPTION_VALUES)) {
    const v = opts[key];
    if (v === undefined || v === null) {
      normalized[key] = DEFAULT_LOCAL_OPTIONS[key];
    } else if (allowed.includes(v)) {
      normalized[key] = v;
    } else {
      return { ok: false, code: 'invalid_options', error: 'ערך לא חוקי בהגדרות העיבוד' };
    }
  }

  return { ok: true, value: { requestId, existingTextMode, options: normalized } };
}

/**
 * sha256 (hex) של JSON קנוני של פרמטרי הבקשה הבלתי-משתנים. אותו requestId עם fingerprint
 * אחר = בקשה אחרת → 409. הסדר קבוע במפורש (לא תלוי בסדר המפתחות בגוף הבקשה).
 */
export function requestFingerprint({ bookId, existingTextMode, options }) {
  const canonical = JSON.stringify([
    'ocr-local-v1',
    String(bookId),
    String(existingTextMode),
    String(options?.lm ?? ''),
    String(options?.defaultScript ?? ''),
  ]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// קוד שגיאת קלט קבועה (LocalInputError.code או קוד הכנה) → סטטוס HTTP
export function httpStatusForPrepError(code) {
  switch (code) {
    case 'no_pages':
      return 400;
    case 'too_many_pages':
    case 'input_too_large':
      return 413;
    case 'prep_abandoned':
      return 409;
    default:
      return 422; // missing_image, unsupported_image, missing_timestamp, invalid_page_number...
  }
}

// הודעה כש-selectPagesForLocal לא החזיר אף עמוד (זהה לנוסח של gemini/ocrwin)
export function noPagesMessage(mode) {
  return mode === 'skip'
    ? 'אין עמודים לא-ערוכים לעיבוד (כל העמודים כבר ערוכים)'
    : 'אין עמודים עם תמונה לעיבוד';
}

// הכנה שה-lease שלה פג לפני יותר מ-PREP_ABANDONED_AFTER_MS — נטושה
export function isAbandonedPreparation(job, now) {
  if (job?.method !== 'local' || job?.status !== 'preparing') return false;
  const until = job.prepLeaseUntil ? new Date(job.prepLeaseUntil).getTime() : 0;
  return until + PREP_ABANDONED_AFTER_MS < now.getTime();
}

// lease שאינו בתוקף (חסר או פג)
export function prepLeaseExpired(job, now) {
  const until = job?.prepLeaseUntil ? new Date(job.prepLeaseUntil).getTime() : 0;
  return until <= now.getTime();
}

// התשובה האידמפוטנטית לעבודה שכבר קיימת ואינה בהכנה.
// עבודה שנסגרה בלי שהקלט שלה הוכן מעולם (כשל קלט קבוע / הכנה נטושה) — אין לה 202: מחזירים
// שוב את שגיאת ההכנה המקורית (אותו סטטוס, אותה הודעה).
export function replayExistingJob(job) {
  const jobId = String(job._id);
  if (!job.preparedAt && job.status === 'cancelled') {
    return { status: 409, body: { error: 'העבודה בוטלה לפני שהקלט שלה הוכן', code: 'cancelled', jobId } };
  }
  if (!job.preparedAt && job.status !== 'preparing') {
    const code = job.errorCode || 'preparation_failed';
    return {
      status: httpStatusForPrepError(code),
      body: { error: job.error || 'הכנת הקלט לעבודה נכשלה', code, jobId },
    };
  }
  return {
    status: 202,
    body: { success: true, jobId, status: job.status, totalPages: job.totalPages ?? 0 },
  };
}

// שגיאת 11000 (duplicate key): על איזה אינדקס — 'requestId' | 'book' | null
export function duplicateKeyTarget(err) {
  if (err?.code !== 11000) return null;
  const kp = err.keyPattern || {};
  if (Object.hasOwn(kp, 'requestId')) return 'requestId';
  if (Object.hasOwn(kp, 'book')) return 'book';
  // דרייברים ישנים — בלי keyPattern; שם האינדקס מופיע בהודעה
  const msg = String(err.message || '');
  if (msg.includes('requestId_unique')) return 'requestId';
  if (msg.includes('book_active_unique')) return 'book';
  return null;
}
