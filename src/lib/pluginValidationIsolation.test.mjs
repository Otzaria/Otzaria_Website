import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { runPluginValidationJob } from './pluginValidationRunner.js'
import { validatePluginArchive, _resetApiSpecCacheForTests } from './pluginValidation.js'
import { readManifestFromPlugin } from './pluginManifest.js'

const fixture = path.resolve('src/lib/testing/plugin-validation-worker.mjs')
const job = (mode, options = {}) => runPluginValidationJob('manifest', Buffer.from(mode), { workerPath: fixture, ...options })
const manifest = { schemaVersion: 1, id: 'repro', name: 'בדיקה', version: '1.0.0', entrypoint: 'index.js', minAppVersion: '0.9.97', permissions: [] }
const zip = (code = '', extra = {}) => Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'index.js': strToU8(code), ...extra }))

test('reads the manifest in a real worker without detaching the caller buffer', async () => {
  const b = zip(); const before = Buffer.from(b)
  assert.deepEqual(await readManifestFromPlugin(b), manifest)
  assert.deepEqual(b, before)
})
test('manifest worker rejects invalid archives', async () => assert.rejects(readManifestFromPlugin(Buffer.from('invalid'))))
test('manifest worker rejects invalid manifest JSON types', async () => {
  for (const text of ['null', '[]', 'false']) {
    await assert.rejects(readManifestFromPlugin(Buffer.from(zipSync({ 'manifest.json': strToU8(text) }))), /JSON object/)
  }
})
test('a spinning worker times out while the main event loop stays responsive', async () => {
  let ticks = 0
  const timer = setInterval(() => ticks++, 10)
  try {
    await assert.rejects(job('spin', { timeoutMs: 180 }), { code: 'PLUGIN_VALIDATION_TIMEOUT' })
    assert.ok(ticks >= 3, `main loop blocked: only ${ticks} ticks`)
  } finally { clearInterval(timer) }
  assert.equal(await job('next'), 'next')
})
for (const [mode, pattern] of [['throw', /crashed/], ['exit', /without a result/], ['reject', /rejected/]]) {
  test(`worker ${mode} rejects and releases the slot`, async () => {
    await assert.rejects(job(mode), pattern)
    assert.equal(await job('recovered'), 'recovered')
  })
}
test('worker startup failure releases the slot', async () => {
  await assert.rejects(job('x', { workerPath: '/missing/plugin-worker.mjs' }))
  assert.equal(await job('recovered'), 'recovered')
})
test('spec preparation failure releases the slot', async () => {
  await assert.rejects(job('x', { getSpec: async () => { throw Error('spec failed') } }), /spec failed/)
  assert.equal(await job('recovered'), 'recovered')
})
test('spec preparation cannot hold a slot indefinitely', async () => {
  await assert.rejects(job('x', { getSpec: () => new Promise(() => {}), timeoutMs: 30 }), { code: 'PLUGIN_VALIDATION_TIMEOUT' })
  assert.equal(await job('recovered'), 'recovered')
})
test('queue admits two waiting requests and rejects the next immediately', async () => {
  let unlock
  const gate = new Promise(resolve => { unlock = resolve })
  const first = job('first', { getSpec: () => gate })
  const second = job('second'); const third = job('third')
  await assert.rejects(job('overflow'), { code: 'PLUGIN_VALIDATION_BUSY' })
  unlock()
  assert.deepEqual(await Promise.all([first, second, third]), ['first', 'second', 'third'])
})
test('a queue timeout removes the waiting job', async () => {
  let unlock
  const gate = new Promise(resolve => { unlock = resolve })
  const first = job('first', { getSpec: () => gate })
  await assert.rejects(job('expired', { queueTimeoutMs: 20 }), { code: 'PLUGIN_VALIDATION_BUSY' })
  const next = job('next'); unlock()
  assert.deepEqual(await Promise.all([first, next]), ['first', 'next'])
})
test('queued jobs run after termination of a timed-out worker', async () => {
  const stuck = assert.rejects(job('spin', { timeoutMs: 120 }), { code: 'PLUGIN_VALIDATION_TIMEOUT' })
  const next = job('next')
  await stuck; assert.equal(await next, 'next')
})
test('unknown job operations are rejected', async () => assert.rejects(runPluginValidationJob('unknown', Buffer.alloc(0)), /Unknown/))
test('invalid buffer arguments are rejected before reserving a slot', async () => {
  await assert.rejects(runPluginValidationJob('manifest', {}), { code: 'PLUGIN_ARCHIVE_LIMIT' })
  assert.equal(await job('healthy'), 'healthy')
})
test('regression: long division/indexing input completes through the full validator', async () => {
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw Error('offline') }; _resetApiSpecCacheForTests()
  try {
    const code = 'const values=[1]; const a="constructor"; const result=values[0] / ' + '[a]'.repeat(64) + ';'
    const result = await validatePluginArchive(zip(code))
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.warnings, [])
  } finally { globalThis.fetch = originalFetch; _resetApiSpecCacheForTests() }
})
test('missing entrypoints are checked in metadata without inflating unrelated assets', async () => {
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw Error('offline') }; _resetApiSpecCacheForTests()
  try {
    const b = zip('', { 'manifest.json': strToU8(JSON.stringify({ ...manifest, entrypoint: 'missing.txt', contributes: { background: { entrypoint: 'missing.bin' } } })), 'unrelated.bin': strToU8('data') })
    const result = await validatePluginArchive(b)
    assert.ok(result.errors.some(e => e.includes('missing.txt')))
    assert.ok(result.errors.some(e => e.includes('missing.bin')))
  } finally { globalThis.fetch = originalFetch; _resetApiSpecCacheForTests() }
})
test('directories cannot masquerade as main or background entrypoints', async () => {
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { throw Error('offline') }; _resetApiSpecCacheForTests()
  try {
    const b = zip('', { 'app/': new Uint8Array(), 'manifest.json': strToU8(JSON.stringify({ ...manifest, entrypoint: 'app/', contributes: { background: { entrypoint: 'app/' } } })) })
    const result = await validatePluginArchive(b)
    assert.equal(result.errors.filter(e => e.includes('app/')).length, 2)
  } finally { globalThis.fetch = originalFetch; _resetApiSpecCacheForTests() }
})
