import { LeaseLostError } from './errors.js'

export const HEARTBEAT_INTERVAL_MS = 25_000
export const HEARTBEAT_MAX_SILENCE_MS = 100_000

/**
 * מחדש את ה-lease כל 25 שניות לאורך כל המשימה. 409 lease_lost, או 100 שניות בלי חידוש מוצלח,
 * קוראים ל-onLost פעם אחת ועוצרים.
 */
export function startHeartbeat({ api, reviewId, leaseToken, onLost, signal, log = () => {},
  intervalMs = HEARTBEAT_INTERVAL_MS, maxSilenceMs = HEARTBEAT_MAX_SILENCE_MS, now = Date.now }) {
  let lastOk = now()
  let stopped = false
  let timer = null
  const ctrl = new AbortController()

  const lose = (reason) => {
    if (stopped) return
    stop()
    onLost(reason)
  }

  const tick = async () => {
    if (stopped) return
    try {
      await api.heartbeat(reviewId, leaseToken, AbortSignal.any([ctrl.signal, AbortSignal.timeout(Math.max(1000, intervalMs))]))
      lastOk = now()
    } catch (err) {
      if (stopped) return
      if (err instanceof LeaseLostError) return lose('lease_lost')
      log('heartbeat_failed', { error: err?.message })
    }
    if (now() - lastOk > maxSilenceMs) return lose('heartbeat_timeout')
    if (!stopped) timer = setTimeout(tick, intervalMs)
  }

  function stop() {
    stopped = true
    clearTimeout(timer)
    ctrl.abort()
  }

  signal?.addEventListener('abort', stop, { once: true })
  timer = setTimeout(tick, intervalMs)
  return { stop }
}
