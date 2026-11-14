import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStrongWorkerSecret, authorizeWorker, newLeaseToken, hashLeaseToken, isLeaseTokenShape } from './workerAuth.js'
import { getServicePluginConfig } from './config.js'

const SECRET = 'Zt7wq1Xk9PbN3vLm8RsY2cHd6FgJ4aUe0oTiQyWxVn5'
const req = (auth) => new Request('http://localhost/api/service-plugins/worker/claim', { method: 'POST', headers: auth ? { authorization: auth } : {} })

test('config: כבוי כברירת מחדל, תיקייה תחת storage', () => {
  const c = getServicePluginConfig({})
  assert.equal(c.enabled, false)
  assert.equal(c.workerSecret, '')
  assert.match(c.storageDir.replace(/\\/g, '/'), /storage\/service-plugins$/)
  assert.equal(getServicePluginConfig({ SERVICE_PLUGINS_ENABLED: 'true', SERVICE_PLUGIN_STORAGE_DIR: ' /x ' }).storageDir, '/x')
  assert.equal(getServicePluginConfig({ SERVICE_PLUGINS_ENABLED: '0' }).enabled, false)
})

test('סוד חזק בלבד', () => {
  assert.ok(isStrongWorkerSecret(SECRET))
  assert.ok(isStrongWorkerSecret('a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'))
  assert.ok(!isStrongWorkerSecret('short-secret'))
  assert.ok(!isStrongWorkerSecret('a'.repeat(64)))
  assert.ok(!isStrongWorkerSecret(`${SECRET} with space`))
  assert.ok(!isStrongWorkerSecret(`${SECRET}א`))
  assert.ok(!isStrongWorkerSecret(undefined))
})

test('authorizeWorker: כבוי/סוד חלש → 403, סוד שגוי → 401 עם WWW-Authenticate', () => {
  const env = { SERVICE_PLUGINS_ENABLED: '1', SERVICE_PLUGIN_WORKER_SECRET: SECRET }
  assert.deepEqual(authorizeWorker(req(`Bearer ${SECRET}`), env), { ok: true })
  assert.equal(authorizeWorker(req(`Bearer ${SECRET}`), { ...env, SERVICE_PLUGINS_ENABLED: '0' }).status, 403)
  const weak = authorizeWorker(req('Bearer weak'), { ...env, SERVICE_PLUGIN_WORKER_SECRET: 'weak' })
  assert.deepEqual([weak.status, weak.error], [403, 'worker_api_disabled'])
  for (const auth of [null, `Bearer ${SECRET}x`, `Basic ${SECRET}`, 'Bearer ']) {
    const r = authorizeWorker(req(auth), env)
    assert.equal(r.status, 401, String(auth))
    assert.match(r.headers['www-authenticate'], /^Bearer/)
  }
})

test('אסימוני lease', () => {
  const t = newLeaseToken()
  assert.ok(isLeaseTokenShape(t))
  assert.notEqual(newLeaseToken(), t)
  assert.match(hashLeaseToken(t), /^[a-f0-9]{64}$/)
  assert.equal(hashLeaseToken(t), hashLeaseToken(t))
  assert.ok(!isLeaseTokenShape('x'))
  assert.ok(!isLeaseTokenShape(null))
})
