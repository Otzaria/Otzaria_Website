import { createHash } from 'node:crypto'
import { abortReason } from './errors.js'
import { sleep } from './util.js'

export const RELEASE_HOSTS = Object.freeze({
  initial: ['github.com'],
  redirect: ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com',
    'github-releases.githubusercontent.com'],
})
export const TARBALL_HOSTS = Object.freeze({
  initial: ['api.github.com'],
  redirect: ['api.github.com', 'codeload.github.com'],
})

export class DownloadError extends Error {
  constructor(code, { status = 0, retryable = false } = {}) {
    super(code)
    this.name = 'DownloadError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

function checkUrl(raw, hosts) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new DownloadError('bad_url')
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new DownloadError('url_not_allowed')
  }
  if (!hosts.includes(url.hostname.toLowerCase())) throw new DownloadError('host_not_allowed')
  return url
}

export const RATE_LIMIT_MAX_WAIT_MS = 3600_000

/** מגבלת קצב של GitHub (429, או 403 עם x-ratelimit-remaining: 0 / Retry-After) → זמן המתנה במילישניות, אחרת null. */
export function rateLimitWaitMs(res, now = Date.now()) {
  const retryAfter = res.headers.get('retry-after')
  const limited = res.status === 429 || (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || retryAfter))
  if (!limited) return null
  const seconds = Number(retryAfter)
  if (retryAfter && Number.isFinite(seconds) && seconds >= 0) return Math.max(1000, seconds * 1000)
  const reset = Number(res.headers.get('x-ratelimit-reset'))
  if (Number.isFinite(reset) && reset > 0) return Math.max(1000, reset * 1000 - now)
  return 60_000
}

/**
 * GET עם מעקב ידני אחרי הפניות: https בלבד, ורק למארחים ברשימה.
 * כותרות (`headers`) נשלחות רק לבקשה הראשונה — לא דולפות למארח אחר בהפניה.
 * מגבלת קצב: המתנה מקומית עד מועד האיפוס (עד שעה), כדי לא לבזבז את ניסיונות השרת.
 */
export async function fetchAllowlisted(rawUrl, { hosts, headers = {}, signal, fetchImpl = globalThis.fetch, maxRedirects = 5,
  maxRateLimitWaits = 3, rateLimitMaxWaitMs = RATE_LIMIT_MAX_WAIT_MS, sleepImpl = sleep }) {
  let url = checkUrl(rawUrl, hosts.initial)
  let waits = 0
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res
    try {
      res = await fetchImpl(url.href, { method: 'GET', redirect: 'manual', signal, headers: hop === 0 ? headers : {} })
    } catch (err) {
      if (signal?.aborted) throw abortReason(signal)
      throw new DownloadError('network', { retryable: true })
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      await res.body?.cancel().catch(() => {})
      if (!location) throw new DownloadError('redirect_without_location', { status: res.status })
      url = checkUrl(new URL(location, url).href, hosts.redirect)
      continue
    }
    const wait = res.ok ? null : rateLimitWaitMs(res)
    if (wait !== null) {
      await res.body?.cancel().catch(() => {})
      if (waits++ >= maxRateLimitWaits) throw new DownloadError('rate_limited', { status: res.status, retryable: true })
      await sleepImpl(Math.min(wait, rateLimitMaxWaitMs), signal)
      url = checkUrl(rawUrl, hosts.initial)
      hop = -1
      continue
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      const retryable = res.status === 429 || res.status >= 500 || res.status === 403
      throw new DownloadError(res.status === 404 || res.status === 410 ? 'not_found' : 'http_error', { status: res.status, retryable })
    }
    return res
  }
  throw new DownloadError('too_many_redirects')
}

/** מגביל זרם בתים ל-maxBytes; חריגה זורקת DownloadError('too_large'). */
export async function* limitStream(body, maxBytes, counter = { bytes: 0 }) {
  for await (const chunk of body) {
    counter.bytes += chunk.length
    if (counter.bytes > maxBytes) throw new DownloadError('too_large')
    yield chunk
  }
}

/** מחשב SHA-256 של גוף התגובה בלי לשמור אותו, עם תקרת גודל. */
export async function hashBody(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {})
    throw new DownloadError('too_large')
  }
  const hash = createHash('sha256')
  const counter = { bytes: 0 }
  for await (const chunk of limitStream(res.body, maxBytes, counter)) hash.update(chunk)
  return { sha256: hash.digest('hex'), size: counter.bytes }
}
