import { parentPort, workerData } from 'node:worker_threads'

const mode = Buffer.from(workerData.buffer).toString()
if (mode === 'spin') {
  while (true) { /* Deliberately block this worker to verify termination. */ }
} else if (mode === 'throw') {
  throw new Error('fixture worker crashed')
} else if (mode === 'exit') {
  process.exit(0)
} else if (mode === 'reject') {
  parentPort.postMessage({ ok: false, error: 'fixture validation rejected' })
} else {
  parentPort.postMessage({ ok: true, result: mode })
}
