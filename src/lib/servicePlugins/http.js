// עזרי HTTP משותפים לראוטים של /api/service-plugins.
import mongoose from 'mongoose'
import { checkSameOrigin } from '../corrections/http.js'
import { requireAccess } from '@/lib/apiResponse'
import { shabbatGate } from '@/lib/shabbat-cache'
import { getServicePluginConfig } from './config.js'
import { LIMITS } from './policy.js'
import { authorizeWorker } from './workerAuth.js'

export const NO_STORE = Object.freeze({ 'cache-control': 'private, no-store' })

export const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } })

export const disabledResponse = () => json({ error: 'disabled' }, 404)
export const notFoundResponse = () => json({ error: 'לא נמצא', code: 'not_found' }, 404)

/** שער session (401/403 של apiResponse.ts) עם no-store. null = עבר. */
export function sessionGate(session, hasAccessFn = () => true) {
  const denied = requireAccess(session, hasAccessFn)
  if (!denied) return null
  denied.headers.set('cache-control', NO_STORE['cache-control'])
  return denied
}

export const isObjectIdString = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value)
export const toObjectId = (value) => new mongoose.Types.ObjectId(String(value))

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code)
    this.status = status
    this.code = code
  }
}

/** קריאת גוף JSON עם תקרת בתים, בלי לצבור יותר מהתקרה בזיכרון. */
export async function readJsonBody(request, maxBytes = LIMITS.jsonBodyBytes) {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, 'body_too_large', 'גוף הבקשה גדול מדי')
  const chunks = []
  let total = 0
  if (request.body) {
    const reader = request.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        reader.cancel().catch(() => {})
        throw new HttpError(413, 'body_too_large', 'גוף הבקשה גדול מדי')
      }
      chunks.push(value)
    }
  }
  const text = Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))).toString('utf8')
  if (!text.trim()) return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'bad_json', 'גוף הבקשה אינו JSON תקין')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'bad_json', 'גוף הבקשה אינו אובייקט JSON')
  return parsed
}

export const tooManyRequests = () => json({ error: 'יותר מדי בקשות. נסו שוב מאוחר יותר', code: 'rate_limited' }, 429)

/**
 * שער השבת לנתיב שמוחרג מה-proxy (העלאת קבצים — ה-proxy היה מעתיק את כל הגוף לזיכרון).
 * אותה החלטה ואותה תשובת JSON כמו ב-src/proxy.js. null = מותר.
 */
export async function shabbatBlock() {
  if (!(await shabbatGate.isAssurBemlacha())) return null
  return Response.json(
    { error: 'shabbat', message: 'הדף אינו פעיל בשבת ובימים טובים לפי שעון ירושלים' },
    { status: 503, headers: { 'cache-control': 'no-store, must-revalidate', 'retry-after': '3600' } },
  )
}

/** null כשמקור הבקשה תקין, אחרת תגובת 403. */
export function rejectCrossSite(request) {
  const check = checkSameOrigin(request)
  return check.ok ? null : json({ error: 'csrf_rejected', reason: check.reason }, 403)
}

/** ממפה תוצאה של פעולת דומיין {ok:false,status,code,message} לתגובה. */
export function failureResponse(result) {
  const { status = 400, code = 'error', message, errors, extra } = result
  return json({ error: message || code, code, ...(errors ? { errors } : {}), ...(extra || {}) }, status)
}

export function errorResponse(err, tag) {
  if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status)
  console.error(`[service-plugins] ${tag} failed:`, err?.message)
  return json({ error: 'אירעה שגיאה, נסה שוב מאוחר יותר', code: 'server_error' }, 500)
}

// ---------------------------------------------------------------- worker (API חיצוני: {error:'<code>'} בלבד)

export const workerJson = (body, status = 200, headers = {}) => json(body, status, headers)
export const workerError = (code, status, headers = {}) => json({ error: code }, status, headers)

/** null כשהמתווך מאומת, אחרת תגובת השגיאה. */
export function rejectWorker(request, env = process.env) {
  const auth = authorizeWorker(request, env)
  return auth.ok ? null : workerError(auth.error, auth.status, auth.headers)
}

export async function readWorkerJson(request, maxBytes = LIMITS.jsonBodyBytes) {
  try {
    return { ok: true, body: await readJsonBody(request, maxBytes) }
  } catch (err) {
    if (err instanceof HttpError) return { ok: false, response: workerError(err.code, err.status) }
    throw err
  }
}

export function workerFailure(result) {
  const headers = result.retryAfter ? { 'retry-after': String(result.retryAfter) } : {}
  return workerError(result.code || 'error', result.status || 400, headers)
}

export function workerServerError(err, tag) {
  console.error(`[service-plugins/worker] ${tag} failed:`, err?.name || 'error')
  return workerError('server_error', 500)
}

export const isEnabled = (env = process.env) => getServicePluginConfig(env).enabled
