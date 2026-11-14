// אימות המתווך (Bearer SERVICE_PLUGIN_WORKER_SECRET) ואסימוני lease. טהור — node built-ins בלבד.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getServicePluginConfig } from './config.js'

const sha256 = (value) => createHash('sha256').update(String(value), 'utf8').digest()

/** סוד חזק: לפחות 43 תווי ASCII מודפסים (=32 בתים ב-base64url), בלי רווחים ולא חוזר על עצמו. */
export function isStrongWorkerSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 43 || secret.length > 1024) return false
  for (let i = 0; i < secret.length; i++) {
    const c = secret.charCodeAt(i)
    if (c < 0x21 || c > 0x7e) return false
  }
  return new Set(secret).size >= 8
}

/**
 * @returns {{ok:true}|{ok:false, status:number, error:string, headers?:object}}
 */
export function authorizeWorker(request, env = process.env) {
  const { enabled, workerSecret } = getServicePluginConfig(env)
  if (!enabled || !isStrongWorkerSecret(workerSecret)) return { ok: false, status: 403, error: 'worker_api_disabled' }
  const header = request.headers.get('authorization') || ''
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!provided || !timingSafeEqual(sha256(provided), sha256(workerSecret))) {
    return { ok: false, status: 401, error: 'unauthorized', headers: { 'www-authenticate': 'Bearer realm="otzaria-service-broker"' } }
  }
  return { ok: true }
}

export const newLeaseToken = () => randomBytes(32).toString('base64url')
export const hashLeaseToken = (token) => createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex')

export function isLeaseTokenShape(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
}
