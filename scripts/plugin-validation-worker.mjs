import { parentPort, workerData } from 'node:worker_threads'
import { readPluginManifest } from '../src/lib/pluginArchive.js'
import { validatePluginArchiveCore } from '../src/lib/pluginValidationCore.js'

try {
  const buffer = Buffer.from(workerData.buffer.buffer, workerData.buffer.byteOffset, workerData.buffer.byteLength)
  const result = workerData.operation === 'manifest'
    ? readPluginManifest(buffer)
    : validatePluginArchiveCore(buffer, workerData.spec)
  parentPort.postMessage({ ok: true, result })
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message || 'Plugin validation failed' })
}
