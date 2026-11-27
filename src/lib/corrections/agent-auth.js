/**
 * אימות שירות הבדיקה במצב משיכה (CONTRACT §3.7). טהור — imports יחסיים ו-node built-ins בלבד.
 * הסוד נפרד מזה של עובד ה-OCR, נקרא רק מ-env של השרת, ולעולם לא נרשם בלוג או מוחזר.
 */
import { isStrongSecret, parseBearer, secretsEqual } from '../ocr/workerAuth.js';

export const AGENT_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;

// סודות אחרים בשרת שסוד הסוכן חייב להיות שונה מכולם (דליפה של אחד לא תפתח את ה-API של האחר).
export const OTHER_SECRET_ENVS = Object.freeze([
  'CRON_SECRET', 'OCR_WORKER_SECRET', 'CORRECTIONS_VERIFY_SECRET', 'DICTA_LIBRARY_GITHUB_TOKEN', 'NEXTAUTH_SECRET',
  'SERVICE_PLUGIN_WORKER_SECRET', 'WIKI_REVALIDATE_SECRET', 'TZURAT_ORDER_SECRET', 'GOOGLE_CLIENT_SECRET',
]);
const MIN_DISTINCT_CHARS = 10;
const MIN_ENTROPY_BITS = 128;

/** הערכת אנטרופיה לפי התפלגות התווים בסוד עצמו (bits) — מזהה סוד חוזר/דל כמו 'S'×48. */
export function secretEntropyBits(secret) {
  const counts = new Map();
  for (const ch of secret) counts.set(ch, (counts.get(ch) || 0) + 1);
  let perChar = 0;
  for (const n of counts.values()) perChar -= (n / secret.length) * Math.log2(n / secret.length);
  return perChar * secret.length;
}

// סוד שהוא חזרה על מחרוזת קצרה ('ab'×30, '0123456789'×5).
function isPeriodic(secret) {
  for (let p = 1; p <= secret.length / 2; p++) {
    if (secret.length % p === 0 && secret.slice(0, p).repeat(secret.length / p) === secret) return true;
  }
  return false;
}

/** סוד חזק לסוכן: כללי הפורמט של סוד עובד ה-OCR, ובנוסף מגוון תווים, אנטרופיה ≥128 ביט ובלי תבנית חוזרת. */
export function isStrongAgentSecret(secret) {
  if (!isStrongSecret(secret)) return false;
  return new Set(secret).size >= MIN_DISTINCT_CHARS && secretEntropyBits(secret) >= MIN_ENTROPY_BITS && !isPeriodic(secret);
}

/**
 * הגדרות הסוכן מ-env. problem: null | 'agent_not_configured' (חסר סוד/מזהה) | 'agent_misconfigured'.
 * @returns {{secret:string, agentId:string, problem:string|null, errors:string[]}}
 */
export function readAgentEnv(env = process.env) {
  // trim (כולל BOM) — כמו קריאת קובץ הסוד בשירות.
  const secret = typeof env.CORRECTIONS_AGENT_SECRET === 'string' ? env.CORRECTIONS_AGENT_SECRET.trim() : '';
  const agentId = typeof env.CORRECTIONS_AGENT_ID === 'string' ? env.CORRECTIONS_AGENT_ID.trim() : '';
  const errors = [];
  if (!secret || !agentId) return { secret, agentId, problem: 'agent_not_configured', errors };
  if (!isStrongAgentSecret(secret)) errors.push('CORRECTIONS_AGENT_SECRET too weak');
  for (const name of OTHER_SECRET_ENVS) {
    const other = typeof env[name] === 'string' ? env[name].trim() : '';
    if (other && secretsEqual(secret, other)) errors.push(`CORRECTIONS_AGENT_SECRET must differ from ${name}`);
  }
  if (!AGENT_ID_RE.test(agentId)) errors.push('CORRECTIONS_AGENT_ID invalid');
  return { secret, agentId, problem: errors.length ? 'agent_misconfigured' : null, errors };
}

/**
 * Bearer של הסוכן + X-Agent-Id. ה-API פתוח רק במצב משיכה עם סוד ומזהה תקינים; אחרת 403
 * agent_api_disabled (השירות מסווג 401/403 כבעיית תצורה ומתריע, ולא כתקלה זמנית).
 * @param {{transport:string, agentSecret:string, agentId:string, agentProblem:string|null}} verify  config.verify
 * @returns {{ok:true, agentId:string} | {ok:false, status:number, code:string}}
 */
export function authenticateAgent(request, verify) {
  if (verify.transport !== 'pull' || verify.agentProblem) return { ok: false, status: 403, code: 'agent_api_disabled' };
  const token = parseBearer(request.headers.get('authorization'));
  if (token === null || !secretsEqual(token, verify.agentSecret)) return { ok: false, status: 401, code: 'unauthorized' };
  if (request.headers.get('x-agent-id') !== verify.agentId) return { ok: false, status: 403, code: 'wrong_agent' };
  return { ok: true, agentId: verify.agentId };
}

/** גרסת הסוכן לתצוגה (X-Agent-Version): ASCII מודפס קצר, אחרת null. */
export function agentVersionOf(request) {
  const v = request.headers.get('x-agent-version');
  return typeof v === 'string' && /^[\x21-\x7e]{1,64}$/.test(v) ? v : null;
}

/**
 * יומן דחיות מוגבל: שורה אחת לכל קוד בדקה, ובשורה הבאה — כמה דחיות נבלעו בינתיים (סורק שפונה לנתיב
 * בייצור לא יציף את היומן).
 * @returns {(code:string) => void}
 */
export function createRejectLogger({ log = console.warn, intervalMs = 60_000, clock = Date.now } = {}) {
  const seen = new Map();
  return (code) => {
    const t = clock();
    const entry = seen.get(code);
    if (entry && t - entry.since < intervalMs) {
      entry.suppressed += 1;
      return;
    }
    log(`[corrections-agent] auth rejected: ${code}${entry?.suppressed ? ` (+${entry.suppressed} more in the last minute)` : ''}`);
    seen.set(code, { since: t, suppressed: 0 });
  };
}
