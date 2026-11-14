// אימות עובד ה-OCR המקומי (Bearer) — מודול טהור, imports יחסיים בלבד (רץ גם ב-node:test).
// הסוד נקרא רק ממשתני סביבה של השרת; לעולם לא נרשם בלוג, לא מוחזר ולא נכנס ל-URL.
import { createHash, timingSafeEqual } from 'node:crypto';

const MIN_RAW_CHARS = 43;
const MIN_DECODED_BYTES = 32;
const WORKER_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

// כללים זהים ל-SecretProvider.IsStrongEnough בשירות: ASCII מודפס (0x21-0x7E) ובנוסף
// לפחות 43 תווים, או hex שמפוענח ל-32 בתים לפחות, או base64 שמפוענח ל-32 בתים לפחות.
export function isStrongSecret(v) {
  if (typeof v !== 'string' || v.length === 0 || !/^[\x21-\x7e]+$/.test(v)) return false;
  if (v.length >= MIN_RAW_CHARS) return true;
  if (v.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(v)) return v.length / 2 >= MIN_DECODED_BYTES;
  if (v.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(v)) {
    const pad = v.endsWith('==') ? 2 : v.endsWith('=') ? 1 : 0;
    return (v.length / 4) * 3 - pad >= MIN_DECODED_BYTES;
  }
  return false;
}

export function readWorkerConfig(env = process.env) {
  // trim (כולל BOM) — כמו SecretProvider בשירות, שמקצץ את קובץ הסוד לפני השימוש.
  const secret = typeof env.OCR_WORKER_SECRET === 'string' ? env.OCR_WORKER_SECRET.trim() : undefined;
  const workerId = typeof env.OCR_WORKER_ID === 'string' ? env.OCR_WORKER_ID.trim() : undefined;
  if (!secret || !workerId) return { ok: false, reason: 'missing' };
  if (!isStrongSecret(secret)) return { ok: false, reason: 'weak_secret' };
  if (!WORKER_ID_RE.test(workerId)) return { ok: false, reason: 'bad_worker_id' };
  return { ok: true, secret, workerId };
}

// רק "Bearer <token>" — רישיות מדויקת, רווח יחיד, בלי רווחים נוספים.
export function parseBearer(header) {
  if (typeof header !== 'string') return null;
  const m = /^Bearer ([\x21-\x7e]+)$/.exec(header);
  return m ? m[1] : null;
}

const digest = (s) => createHash('sha256').update(String(s), 'utf8').digest();

// השוואה קבועת-זמן על digest באורך קבוע — אורך הסוד אינו דולף.
export function secretsEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

// תצורה חסרה/חלשה בשרת → 403 worker_api_disabled (ולא 503): השירות מסווג 401/403 כבעיית
// תצורה/אימות — מחזיק את העבודות, מתריע למפעיל וממשיך לנסות מעצמו. 503 היה נבלע כתקלה זמנית
// בלי התראה. 401 שמור ל-Bearer חסר/שגוי.
export function authenticateWorker(request, env = process.env) {
  const cfg = readWorkerConfig(env);
  if (!cfg.ok) return { ok: false, status: 403, code: 'worker_api_disabled' };
  const token = parseBearer(request.headers.get('authorization'));
  if (token === null || !secretsEqual(token, cfg.secret)) {
    return { ok: false, status: 401, code: 'unauthorized' };
  }
  return { ok: true, workerId: cfg.workerId };
}
