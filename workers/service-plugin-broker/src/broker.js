import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { HttpError, JobAborted, JobFailure, LeaseLostError, abortReason } from './errors.js'
import { startHeartbeat } from './heartbeat.js'
import { JobContext } from './job.js'
import { cleanupJobFiles, runPipeline } from './pipeline.js'
import { killAllChildren } from './process.js'
import { OBJECT_ID_RE, removeDir, retryDelay, sleep } from './util.js'

const IDLE_POLL_MS = 30_000
const MAINTENANCE_INTERVAL_MS = 3600_000

/** רשימת השמירה מהשרת → קבוצת reviewId. מבנה לא תקין → null (לא מוחקים דבר). */
export function keepSetFrom(response) {
  if (!Array.isArray(response?.keep)) return null
  const ids = new Set()
  for (const item of response.keep) {
    if (!Array.isArray(item?.reviewIds)) return null
    for (const id of item.reviewIds) {
      if (typeof id === 'string' && OBJECT_ID_RE.test(id)) ids.add(id)
    }
  }
  return ids
}

/** מוחק תיקיות עבודה ותמונות מקור שאינן ברשימת השמירה. */
export async function pruneDataDir(dataDir, keep, activeReviewId = null) {
  const removed = []
  for (const sub of ['jobs', 'private', 'snapshots']) {
    let names = []
    try {
      names = await readdir(path.join(dataDir, sub))
    } catch {
      continue
    }
    for (const name of names) {
      if (!OBJECT_ID_RE.test(name) || keep.has(name) || name === activeReviewId) continue
      await removeDir(path.join(dataDir, sub, name))
      removed.push(`${sub}/${name}`)
    }
  }
  return removed
}

export class Broker {
  constructor({ config, api, log = () => {}, stages, fetchImpl, heartbeatOptions = {}, idlePollMs = IDLE_POLL_MS, backoffBaseMs = 5000,
    codeFingerprint = null }) {
    this.config = config
    this.api = api
    this.log = log
    this.stages = stages
    this.fetchImpl = fetchImpl
    this.heartbeatOptions = heartbeatOptions
    this.idlePollMs = idlePollMs
    this.backoffBaseMs = backoffBaseMs
    this.stopController = new AbortController()
    this.jobController = null
    this.lastMaintenance = 0
    this.codeFingerprint = codeFingerprint
    this.loadedCode = null
    this.restartRequested = false
  }

  stop(reason = 'shutdown') {
    if (this.stopController.signal.aborted) return
    this.log('stopping', { reason })
    this.stopController.abort(new JobAborted(reason))
    this.jobController?.abort(new JobAborted(reason))
    killAllChildren(5000)
  }

  async run() {
    const stopSignal = this.stopController.signal
    let failures = 0
    this.loadedCode = await this.readCodeFingerprint()
    while (!stopSignal.aborted) {
      try {
        if (await this.codeChanged()) {
          this.restartRequested = true
          this.log('code_changed', { action: 'restart' })
          break
        }
        await this.maybeMaintenance()
        const { job, retryAfterMs } = await this.api.claim(stopSignal)
        failures = 0
        if (!job) {
          await sleep(retryAfterMs > 0 ? retryAfterMs : this.idlePollMs, stopSignal)
          continue
        }
        await this.runJob(job)
      } catch (err) {
        if (stopSignal.aborted) break
        failures++
        const wait = err instanceof HttpError && err.retryAfterMs ? err.retryAfterMs : retryDelay(failures, this.backoffBaseMs, 300_000)
        this.log('loop_error', { error: err?.message, status: err?.status, waitMs: wait })
        await sleep(wait, stopSignal).catch(() => {})
      }
    }
    this.log('stopped')
  }

  async readCodeFingerprint() {
    if (!this.codeFingerprint) return null
    try {
      return await this.codeFingerprint()
    } catch (err) {
      this.log('code_fingerprint_failed', { error: err?.message })
      return null
    }
  }

  /** הפריסה מעדכנת את העותק בדיסק; בודקים רק בין משימות, כדי שעדכון לא יקטע בדיקה פעילה. */
  async codeChanged() {
    if (!this.loadedCode) return false
    const current = await this.readCodeFingerprint()
    return current !== null && current !== this.loadedCode
  }

  async maybeMaintenance(now = Date.now()) {
    if (now - this.lastMaintenance < MAINTENANCE_INTERVAL_MS) return
    this.lastMaintenance = now
    try {
      const keep = keepSetFrom(await this.api.maintenance(this.stopController.signal))
      if (!keep) return this.log('maintenance_skipped', { reason: 'bad_keep_list' })
      const removed = await pruneDataDir(this.config.dataDir, keep)
      this.log('maintenance', { removed: removed.length })
    } catch (err) {
      this.log('maintenance_failed', { error: err?.message })
    }
  }

  /** משימה אחת: heartbeat לכל אורכה, צינור, ודיווח תוצאה או כשל. */
  async runJob(job) {
    const ctrl = new AbortController()
    this.jobController = ctrl
    const onStop = () => ctrl.abort(new JobAborted('shutdown'))
    this.stopController.signal.addEventListener('abort', onStop, { once: true })
    const hb = startHeartbeat({
      api: this.api, reviewId: job.reviewId, leaseToken: job.leaseToken, signal: ctrl.signal,
      log: (e, d) => this.log(e, { reviewId: job.reviewId, ...d }),
      onLost: (reason) => {
        this.log('lease_lost', { reviewId: job.reviewId, reason })
        ctrl.abort(new JobAborted(reason))
      },
      ...this.heartbeatOptions,
    })
    const ctx = new JobContext({ job, config: this.config, api: this.api, signal: ctrl.signal, log: this.log, fetchImpl: this.fetchImpl })
    this.log('job_start', { reviewId: job.reviewId, kind: job.kind, attempts: job.attempts })
    let outcome = 'aborted'
    try {
      const { decision, report } = await runPipeline(ctx, this.stages ? { stages: this.stages } : {})
      const res = await this.api.result(job.reviewId, job.leaseToken, { digest: job.manifestDigest, decision, report }, ctrl.signal)
      outcome = `decision:${decision}`
      this.log('job_result', { reviewId: job.reviewId, decision, status: res?.json?.status, published: res?.json?.published })
      await cleanupJobFiles(ctx).catch(() => {})
    } catch (err) {
      outcome = await this.handleJobError(ctx, err, ctrl.signal)
    } finally {
      hb.stop()
      this.stopController.signal.removeEventListener('abort', onStop)
      if (!ctrl.signal.aborted) ctrl.abort(new JobAborted('job_finished'))
      killAllChildren(5000)
      this.jobController = null
      await ctx.stageLog('job', 'end', { outcome })
    }
    return outcome
  }

  async handleJobError(ctx, err, signal) {
    const { job } = ctx
    if (err instanceof JobAborted || err instanceof LeaseLostError || signal.aborted) {
      const reason = err instanceof JobAborted ? err.reason : signal.aborted ? abortReason(signal).reason : 'lease_lost'
      this.log('job_aborted', { reviewId: job.reviewId, reason })
      return `aborted:${reason}`
    }
    const failure = err instanceof JobFailure
      ? err
      : err instanceof HttpError
        ? new JobFailure('operator', 'worker_api_error', `האתר דחה בקשה של המתווך (${err.status} ${err.code ?? ''})`.trim())
        : new JobFailure('transient', 'broker_error', 'שגיאה פנימית במתווך הבדיקה')
    if (!(err instanceof JobFailure)) this.log('job_internal_error', { reviewId: job.reviewId, error: err?.stack ?? String(err) })
    try {
      const res = await this.api.failure(job.reviewId, job.leaseToken, {
        failureClass: failure.failureClass,
        code: failure.code,
        message: failure.message,
        resetAt: failure.resetAt instanceof Date ? failure.resetAt.toISOString() : failure.resetAt ?? undefined,
      }, signal)
      this.log('job_failure', { reviewId: job.reviewId, class: failure.failureClass, code: failure.code, status: res?.json?.status })
    } catch (e) {
      this.log('job_failure_report_failed', { reviewId: job.reviewId, error: e?.message })
    }
    return `failure:${failure.failureClass}:${failure.code}`
  }
}
