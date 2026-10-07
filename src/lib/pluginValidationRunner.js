import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { MAX_PLUGIN_BYTES } from './pluginLimits.js'

export const PLUGIN_VALIDATION_TIMEOUT_MS = 5000
export const MAX_QUEUED_PLUGIN_VALIDATIONS = 2
const QUEUE_TIMEOUT_MS = 10000
// Next builds separate route bundles. The queue must be shared across all of them.
const POOL_KEY = Symbol.for('otzaria.pluginValidation.pool')
const pool = (globalThis[POOL_KEY] ??= { active: false, queue: [] })

function jobError(code, message) {
  return Object.assign(new Error(message), { code })
}

function releaseSlot() {
  const next = pool.queue.shift()
  if (next) {
    clearTimeout(next.timer)
    next.resolve(makeRelease())
  } else {
    pool.active = false
  }
}

function makeRelease() {
  let released = false
  return () => {
    if (released) return
    released = true
    releaseSlot()
  }
}

function acquireSlot(queueTimeoutMs) {
  if (!pool.active) {
    pool.active = true
    return Promise.resolve(makeRelease())
  }
  if (pool.queue.length >= MAX_QUEUED_PLUGIN_VALIDATIONS) {
    return Promise.reject(jobError('PLUGIN_VALIDATION_BUSY', 'Plugin validation is busy; try again later'))
  }
  return new Promise((resolve, reject) => {
    const entry = { resolve, timer: null }
    entry.timer = setTimeout(() => {
      const index = pool.queue.indexOf(entry)
      if (index >= 0) pool.queue.splice(index, 1)
      reject(jobError('PLUGIN_VALIDATION_BUSY', 'Plugin validation queue timed out; try again later'))
    }, queueTimeoutMs)
    pool.queue.push(entry)
  })
}

function executeJob(operation, buffer, spec, { timeoutMs, workerPath }) {
  return new Promise((resolve, reject) => {
    // Transfer a dedicated allocation; never detach the upload's original Buffer.
    const bytes = Uint8Array.from(buffer)
    const worker = new Worker(workerPath, {
      workerData: { operation, buffer: bytes, spec },
      transferList: [bytes.buffer],
      execArgv: ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON'],
      resourceLimits: { maxOldGenerationSizeMb: 256, stackSizeMb: 4 },
    })
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // Keep the slot until termination completes, even for a stuck native regex.
      worker.terminate().then(() => {
        if (error) reject(error)
        else resolve(result)
      }, reject)
    }
    const timer = setTimeout(() => {
      finish(jobError('PLUGIN_VALIDATION_TIMEOUT', 'Plugin validation exceeded its time limit'))
    }, timeoutMs)
    worker.once('message', (message) => {
      if (message?.ok === true) finish(null, message.result)
      else finish(jobError('PLUGIN_VALIDATION_FAILED', message?.error || 'Plugin validation failed'))
    })
    worker.once('error', (error) => finish(error))
    worker.once('exit', (code) => {
      if (!settled) finish(jobError('PLUGIN_VALIDATION_FAILED', `Plugin validation worker exited without a result (${code})`))
    })
  })
}

export async function runPluginValidationJob(operation, buffer, {
  getSpec,
  timeoutMs = PLUGIN_VALIDATION_TIMEOUT_MS,
  queueTimeoutMs = QUEUE_TIMEOUT_MS,
  workerPath = path.join(process.cwd(), 'scripts', 'plugin-validation-worker.mjs'),
} = {}) {
  if (!['manifest', 'validate'].includes(operation)) throw new Error('Unknown plugin validation operation')
  if (!(buffer instanceof Uint8Array) || buffer.byteLength > MAX_PLUGIN_BYTES) {
    throw jobError('PLUGIN_ARCHIVE_LIMIT', 'Plugin archive exceeds its compressed size limit')
  }
  const release = await acquireSlot(queueTimeoutMs)
  let specTimer
  try {
    // Spec preparation is also bounded; a stuck fetch must not own the slot forever.
    const spec = getSpec ? await Promise.race([
      Promise.resolve().then(getSpec),
      new Promise((_, reject) => {
        specTimer = setTimeout(() => reject(jobError('PLUGIN_VALIDATION_TIMEOUT', 'Plugin spec preparation timed out')), timeoutMs)
      }),
    ]) : undefined
    clearTimeout(specTimer)
    return await executeJob(operation, buffer, spec, { timeoutMs, workerPath })
  } finally {
    clearTimeout(specTimer)
    release()
  }
}
