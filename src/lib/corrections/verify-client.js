/**
 * לקוח שרתי לשירות הבדיקה (CONTRACT §3). פונה רק לכתובת הבסיס מההגדרה; לא עוקב
 * אחרי הפניות ולא משתמש בשום כתובת מהתשובה. TLS רגיל של Node (אימות מלא).
 */
import { describeFetchError, parseRetryAfter } from './classify.js';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const JOB_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

async function readCapped(resp) {
  const reader = resp.body?.getReader?.();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw Object.assign(new Error('response too large'), { tooLarge: true });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * @param {{verify:{enabled:boolean, disabledReason:string|null, url:string, secret:string, timeoutMs:number}}} config
 * @param {{request:object, serviceJobId?:string|null, fetchImpl?:Function, now?:Date}} opts
 * @returns {Promise<{ok:true, status:number, body:any} | {ok:false, failure:object, retryAfterSeconds:number|null}>}
 */
export async function callVerifyService(config, { request, serviceJobId = null, fetchImpl = fetch, now = new Date() }) {
  const v = config.verify;
  if (!v.enabled) return { ok: false, failure: { kind: 'config', reason: v.disabledReason }, retryAfterSeconds: null };
  if (serviceJobId !== null && !JOB_ID_RE.test(serviceJobId)) return { ok: false, failure: { kind: 'response', reason: 'invalid_response' }, retryAfterSeconds: null };

  const url = serviceJobId ? `${v.url}/v1/verify/${encodeURIComponent(serviceJobId)}` : `${v.url}/v1/verify`;
  const headers = {
    Authorization: `Bearer ${v.secret}`,
    'X-Request-Id': request.request_id,
    'X-Api-Version': '1',
    Accept: 'application/json',
  };
  if (!serviceJobId) headers['Content-Type'] = 'application/json';

  let resp;
  try {
    resp = await fetchImpl(url, {
      method: serviceJobId ? 'GET' : 'POST',
      headers,
      body: serviceJobId ? undefined : JSON.stringify(request),
      redirect: 'error',
      signal: AbortSignal.timeout(v.timeoutMs),
    });
  } catch (err) {
    return { ok: false, failure: describeFetchError(err), retryAfterSeconds: null };
  }

  const retryAfterSeconds = parseRetryAfter(resp.headers.get('retry-after'), now);
  if (resp.status !== 200 && resp.status !== 202) {
    try { await resp.body?.cancel?.(); } catch { /* ignore */ }
    return { ok: false, failure: { kind: 'http', status: resp.status }, retryAfterSeconds };
  }
  let text;
  try {
    text = await readCapped(resp);
  } catch (err) {
    if (err.tooLarge) return { ok: false, failure: { kind: 'response', reason: 'response_too_large' }, retryAfterSeconds: null };
    return { ok: false, failure: describeFetchError(err), retryAfterSeconds: null };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, failure: { kind: 'response', reason: 'invalid_json' }, retryAfterSeconds: null };
  }
  return { ok: true, status: resp.status, body, retryAfterSeconds };
}
