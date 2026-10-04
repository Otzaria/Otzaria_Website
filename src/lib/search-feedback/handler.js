/**
 * POST /api/search-feedback/{register,events} — ציבורי, חתום ed25519 על הבתים הגולמיים של הגוף.
 * הלקוח מחליט לפי קוד ה-error (ראו חוזה הפרוטוקול), ולכן הקודים כאן הם חלק מה-API.
 */
import connectDBDefault from '../db.js';
import { checkRateLimit } from '../rate-limit.js';
import { getClientIp } from '../client-ip.js';
import { readBodyBytesLimited } from '../corrections/report-email.js';
import { getSearchFeedbackConfig, ipBucketWarning } from './config.js';
import { KEY_ID_RE, computeKeyId, verifyBodySignature } from './crypto.js';
import {
  MAX_EVENTS_BODY_BYTES, MAX_REGISTER_BODY_BYTES, extractPublicKey, validateEventsBatch, validateRegister,
} from './validation.js';
import { findKey, ingestEvents, registerKey } from './service.js';

const RATE_LIMIT_RETRY_AFTER_S = 300;
const DISABLED_RETRY_AFTER_S = 3600;

const json = (body, status = 200, extraHeaders = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extraHeaders } });
const fail = (error, status, extra = {}) => json({ error, ...extra }, status);
const rateLimited = () => json({ error: 'rate_limited' }, 429, { 'retry-after': String(RATE_LIMIT_RETRY_AFTER_S) });

/**
 * @typedef {object} Deps
 * @property {Function} [connectDB]
 * @property {object} [config] getSearchFeedbackConfig()
 * @property {() => Date} [now]
 * @property {(bucket:string, id:string, tokensPerHour:number) => boolean} [rateLimit]
 * @property {(request:Request) => string} [getIp]
 */
let ipWarningLogged = false;

function defaultConfig() {
  if (!ipWarningLogged) {
    ipWarningLogged = true;
    const warning = ipBucketWarning();
    if (warning) console.warn(warning);
  }
  return getSearchFeedbackConfig();
}

function resolveDeps(deps = {}) {
  return {
    connectDB: deps.connectDB || connectDBDefault,
    config: deps.config || defaultConfig(),
    now: deps.now || (() => new Date()),
    rateLimit: deps.rateLimit
      || ((bucket, id, tokens) => checkRateLimit(id, `search-feedback-${bucket}`, tokens, 'hour')),
    getIp: deps.getIp || getClientIp,
  };
}

async function readRaw(request, maxBytes) {
  try {
    return { bytes: await readBodyBytesLimited(request, maxBytes) };
  } catch (err) {
    if (err?.code === 'BODY_TOO_LARGE') return { response: fail('too_large', 413) };
    return { response: fail('invalid_json', 400) };
  }
}

function parseJson(bytes) {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false };
  }
}

/** @param {Request} request @param {Deps} deps */
export async function handleRegisterPost(request, deps) {
  const d = resolveDeps(deps);
  if (!d.config.enabled) return json({ error: 'disabled' }, 503, { 'retry-after': String(DISABLED_RETRY_AFTER_S) });
  if (!d.rateLimit('register-ip', d.getIp(request), d.config.limits.registerPerIpPerHour)) return rateLimited();

  const { bytes, response } = await readRaw(request, MAX_REGISTER_BODY_BYTES);
  if (response) return response;
  const parsed = parseJson(bytes);
  if (!parsed.ok) return fail('invalid_json', 400);

  // המפתח הציבורי נמצא בגוף עצמו, ולכן מפענחים קודם; החתימה עדיין נבדקת על הבתים המקוריים.
  const key = extractPublicKey(parsed.value);
  if (!key.ok) return fail('invalid_payload', 422, { field: key.field });
  if (!verifyBodySignature(bytes, request.headers.get('x-otzaria-signature'), key.value)) {
    return fail('bad_signature', 401);
  }
  const valid = validateRegister(parsed.value, d.now());
  if (!valid.ok) return fail('invalid_payload', 422, { field: valid.field });

  try {
    await d.connectDB();
    const result = await registerKey(valid.value, { now: d.now() });
    if (result.status === 'blocked') return fail('key_blocked', 403);
    return json(result);
  } catch (error) {
    console.error('Search feedback register failed:', error?.message);
    return fail('server_error', 500);
  }
}

/** @param {Request} request @param {Deps} deps */
export async function handleEventsPost(request, deps) {
  const d = resolveDeps(deps);
  if (!d.config.enabled) return json({ error: 'disabled' }, 503, { 'retry-after': String(DISABLED_RETRY_AFTER_S) });
  if (!d.rateLimit('events-ip', d.getIp(request), d.config.limits.eventsPerIpPerHour)) return rateLimited();

  const { bytes, response } = await readRaw(request, MAX_EVENTS_BODY_BYTES);
  if (response) return response;

  const keyId = request.headers.get('x-otzaria-key-id') || '';
  if (!KEY_ID_RE.test(keyId)) return fail('unknown_key', 401);

  try {
    await d.connectDB();
    const key = await findKey(keyId);
    // keyId נגזר מחדש מהמפתח השמור — לא סומכים על הכותרת לבדה.
    if (!key || computeKeyId(key.publicKey) !== keyId) return fail('unknown_key', 401);
    if (!verifyBodySignature(bytes, request.headers.get('x-otzaria-signature'), key.publicKey)) {
      return fail('bad_signature', 401);
    }
    if (key.status === 'blocked') return fail('key_blocked', 403);
    // אחרי אימות החתימה, כדי שזר שמכיר keyId לא ירוקן את המכסה של ההתקנה.
    if (!d.rateLimit('events-key', keyId, d.config.limits.eventsPerKeyPerHour)) return rateLimited();

    const parsed = parseJson(bytes);
    if (!parsed.ok) return fail('invalid_json', 400);
    const now = d.now();
    const valid = validateEventsBatch(parsed.value, now);
    if (!valid.ok) return fail('invalid_payload', 422, { field: valid.field });

    return json(await ingestEvents(keyId, valid.value, { now }));
  } catch (error) {
    console.error('Search feedback events failed:', error?.message);
    return fail('server_error', 500);
  }
}
