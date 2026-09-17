/**
 * מסווג התקלות המרכזי היחיד של שירות הבדיקה (CONTRACT §3.6).
 * כל מה שלא מזוהה במפורש = unknown → ידני. לעולם לא rejected ולא אישור.
 */

export const FAILURE_CLASS = Object.freeze({ TRANSIENT: 'transient', PERMANENT: 'permanent', UNKNOWN: 'unknown' });

const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const PERMANENT_HTTP = new Set([400, 401, 403, 404, 405, 410, 422]);
const TRANSIENT_NET = new Set(['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'EPIPE']);
const PERMANENT_NET = new Set(['ENOTFOUND']);
const TLS_CODES = /^(CERT_|ERR_TLS_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|ERR_SSL_)/;
const CONFIG_REASONS = new Set(['service_disabled', 'service_not_configured', 'service_misconfigured', 'service_secret_missing', 'mock_forbidden_in_production', 'service_paused']);
const PERMANENT_RESPONSE = new Set(['invalid_json', 'invalid_response', 'response_mismatch', 'unsupported_api_version', 'missing_fields', 'unknown_decision', 'unsupported_capability', 'redirect_refused', 'response_too_large']);

/**
 * @param {{kind:'config'|'http'|'network'|'timeout'|'response'|'service_failed', status?:number, code?:string, reason?:string, reasonCode?:string}} f
 * @returns {{cls:'transient'|'permanent'|'unknown', reason:string}}
 */
export function classifyVerifyFailure(f) {
  if (!f || typeof f !== 'object') return { cls: FAILURE_CLASS.UNKNOWN, reason: 'unknown_failure' };
  switch (f.kind) {
    case 'config':
      return CONFIG_REASONS.has(f.reason)
        ? { cls: FAILURE_CLASS.PERMANENT, reason: f.reason }
        : { cls: FAILURE_CLASS.PERMANENT, reason: 'service_not_configured' };
    case 'timeout':
      return { cls: FAILURE_CLASS.TRANSIENT, reason: 'timeout' };
    case 'http': {
      const s = f.status;
      if (TRANSIENT_HTTP.has(s)) return { cls: FAILURE_CLASS.TRANSIENT, reason: `http_${s}` };
      if (PERMANENT_HTTP.has(s)) return { cls: FAILURE_CLASS.PERMANENT, reason: `http_${s}` };
      return { cls: FAILURE_CLASS.UNKNOWN, reason: `http_${Number.isInteger(s) ? s : 'unknown'}` };
    }
    case 'network': {
      const code = String(f.code || '');
      if (TRANSIENT_NET.has(code)) return { cls: FAILURE_CLASS.TRANSIENT, reason: `net_${code}` };
      if (PERMANENT_NET.has(code)) return { cls: FAILURE_CLASS.PERMANENT, reason: `net_${code}` };
      if (TLS_CODES.test(code)) return { cls: FAILURE_CLASS.PERMANENT, reason: 'tls_failure' };
      return { cls: FAILURE_CLASS.UNKNOWN, reason: code ? `net_${code}` : 'network_unknown' };
    }
    case 'response':
      return PERMANENT_RESPONSE.has(f.reason)
        ? { cls: FAILURE_CLASS.PERMANENT, reason: f.reason }
        : { cls: FAILURE_CLASS.UNKNOWN, reason: f.reason || 'invalid_response' };
    case 'service_failed':
      if (f.reasonCode === 'service_capacity') return { cls: FAILURE_CLASS.TRANSIENT, reason: 'service_capacity' };
      if (f.reasonCode === 'unsupported_capability') return { cls: FAILURE_CLASS.PERMANENT, reason: 'unsupported_capability' };
      return { cls: FAILURE_CLASS.UNKNOWN, reason: 'service_failed' };
    default:
      return { cls: FAILURE_CLASS.UNKNOWN, reason: 'unknown_failure' };
  }
}

/** ממפה שגיאת fetch לאובייקט קלט של המסווג. */
export function describeFetchError(err) {
  if (!err) return { kind: 'network', code: '' };
  if (err.name === 'AbortError' || err.name === 'TimeoutError' || err.code === 'ABORT_ERR') return { kind: 'timeout' };
  const cause = err.cause || {};
  const code = cause.code || err.code || '';
  if (/redirect/i.test(String(err.message || '')) || /redirect/i.test(String(cause.message || ''))) {
    return { kind: 'response', reason: 'redirect_refused' };
  }
  return { kind: 'network', code };
}

/**
 * backoff מעריכי עם jitter מלא, כיבוד Retry-After עד התקרה, ועצירה במיצוי.
 * @returns {{exhausted:false, nextAttemptAt:Date} | {exhausted:true, reason:'retries_exhausted'|'deadline_exhausted'}}
 */
export function computeRetry({ attempts, maxAttempts, deadlineAt, now, baseSeconds, capSeconds, retryAfterSeconds = null, random = Math.random }) {
  if (attempts >= maxAttempts) return { exhausted: true, reason: 'retries_exhausted' };
  const exp = Math.min(capSeconds, baseSeconds * 2 ** Math.max(0, attempts - 1));
  let delay = Math.max(1, Math.round(exp / 2 + random() * (exp / 2)));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) delay = Math.max(delay, Math.min(capSeconds, Math.ceil(retryAfterSeconds)));
  delay = Math.min(delay, capSeconds);
  const next = new Date(now.getTime() + delay * 1000);
  if (deadlineAt && next.getTime() > new Date(deadlineAt).getTime()) return { exhausted: true, reason: 'deadline_exhausted' };
  return { exhausted: false, nextAttemptAt: next, delaySeconds: delay };
}

/** פענוח Retry-After (שניות או תאריך HTTP). */
export function parseRetryAfter(value, now = new Date()) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (/^\d{1,9}$/.test(s)) return Number(s);
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - now.getTime()) / 1000));
}
