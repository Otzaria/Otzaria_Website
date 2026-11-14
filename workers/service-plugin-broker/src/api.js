import { ASSET_KEYS } from './policy.js'
import { HttpError, LeaseLostError, abortReason } from './errors.js'
import { OBJECT_ID_RE, retryDelay, sleep } from './util.js'

const REQUEST_TIMEOUT_MS = 30_000

function parseRetryAfter(value) {
  if (!value) return null
  const n = Number(value)
  if (Number.isFinite(n) && n >= 0) return Math.min(n, 24 * 3600) * 1000
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null
}

/** לקוח ה-API של המתווך (`/api/service-plugins/worker/*`). */
export class WorkerApi {
  constructor({ siteUrl, workerSecret, workerId, fetchImpl = globalThis.fetch, requestTimeoutMs = REQUEST_TIMEOUT_MS }) {
    this.base = `${siteUrl}/api/service-plugins/worker`
    this.secret = workerSecret
    this.workerId = workerId
    this.fetch = fetchImpl
    this.requestTimeoutMs = requestTimeoutMs
  }

  #url(...parts) {
    return [this.base, ...parts].join('/')
  }

  async #send(method, url, { body, signal, headers = {}, stream = false } = {}) {
    const timeout = AbortSignal.timeout(stream ? 15 * 60_000 : this.requestTimeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let res
    try {
      res = await this.fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${this.secret}`,
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: combined,
        redirect: 'error',
      })
    } catch (err) {
      if (signal?.aborted) throw abortReason(signal)
      throw new HttpError(0, err?.name === 'TimeoutError' ? 'timeout' : 'network', { retryable: true })
    }
    if (res.ok && (stream || res.status === 204)) return res
    let json = null
    try {
      json = await res.json()
    } catch {
      json = null
    }
    if (res.ok) return { status: res.status, json, headers: res.headers }
    const code = typeof json?.error === 'string' ? json.error : null
    if (res.status === 409 && code === 'lease_lost') throw new LeaseLostError()
    const retryable = res.status === 503 || res.status === 429 || res.status >= 500 || res.status === 408
    throw new HttpError(res.status, code, { retryable, retryAfterMs: parseRetryAfter(res.headers.get('retry-after')) })
  }

  /** מנסה שוב על שגיאות רשת/503/5xx עד שה-signal מבוטל. */
  async #withRetry(fn, signal) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn()
      } catch (err) {
        if (!(err instanceof HttpError) || !err.retryable) throw err
        await sleep(err.retryAfterMs ?? retryDelay(attempt), signal)
      }
    }
  }

  /** @returns {Promise<{job:object}|{job:null, retryAfterMs:number|null}>} */
  async claim(signal) {
    const res = await this.#send('POST', this.#url('claim'), { body: { workerId: this.workerId }, signal })
    if (res.status === 204) return { job: null, retryAfterMs: parseRetryAfter(res.headers.get('retry-after')) }
    if (!res.json?.job) throw new HttpError(res.status, 'bad_claim_response')
    return { job: res.json.job }
  }

  async heartbeat(reviewId, leaseToken, signal) {
    const res = await this.#send('POST', this.#url(checkId(reviewId), 'heartbeat'), { body: { leaseToken }, signal })
    return res.json ?? {}
  }

  checkpoint(reviewId, leaseToken, { stage, digest, data }, signal) {
    return this.#withRetry(() =>
      this.#send('POST', this.#url(checkId(reviewId), 'checkpoint'), { body: { leaseToken, stage, digest, data }, signal }), signal)
  }

  failure(reviewId, leaseToken, { failureClass, code, message, resetAt }, signal) {
    const body = { leaseToken, class: failureClass, code, message }
    if (resetAt) body.resetAt = resetAt
    return this.#withRetry(() => this.#send('POST', this.#url(checkId(reviewId), 'failure'), { body, signal }), signal)
  }

  result(reviewId, leaseToken, { digest, decision, report }, signal) {
    return this.#withRetry(() =>
      this.#send('POST', this.#url(checkId(reviewId), 'result'), { body: { leaseToken, digest, decision, report }, signal }), signal)
  }

  /** @returns {Promise<Response>} תגובה עם גוף בזרימה */
  openAsset(reviewId, key, leaseToken, signal) {
    if (!ASSET_KEYS.includes(key)) throw new Error('invalid asset key')
    const url = this.#url(checkId(reviewId), 'asset', key)
    return this.#withRetry(() => this.#send('GET', url, {
      headers: { 'x-lease-token': leaseToken, accept: 'application/octet-stream' }, signal, stream: true,
    }), signal)
  }

  async maintenance(signal) {
    const res = await this.#send('POST', this.#url('maintenance'), { body: { workerId: this.workerId }, signal })
    return res.json ?? {}
  }
}

function checkId(reviewId) {
  if (!OBJECT_ID_RE.test(String(reviewId))) throw new Error('invalid review id')
  return reviewId
}
