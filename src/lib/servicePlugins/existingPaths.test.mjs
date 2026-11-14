import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isServicePlugin,
  resolveServicePluginFile,
  serviceManageUrl,
  pluginStoreUrl,
  serviceBlockedBody,
  SERVICE_BLOCK_MESSAGES
} from './existingPaths.js'

const CURRENT = 'a'.repeat(24)
const OLD = 'b'.repeat(24)

function servicePlugin(overrides = {}) {
  return {
    _id: 'c'.repeat(24),
    hasService: true,
    version: '2.0.0',
    pluginFileSize: 20,
    pluginFileSha256: 'f'.repeat(64),
    pluginFileName: 'plugin.otzplugin',
    serviceState: { currentPluginReview: { toString: () => CURRENT } },
    versions: [
      { version: '1.0.0', reviewId: OLD, pluginFileSize: 10, pluginFileSha256: 'e'.repeat(64) },
      { version: '0.9.0', pluginFileSize: 5 }
    ],
    ...overrides
  }
}

test('isServicePlugin is strict about the flag', () => {
  assert.equal(isServicePlugin(servicePlugin()), true)
  assert.equal(isServicePlugin({ hasService: 'true' }), false)
  assert.equal(isServicePlugin({}), false)
  assert.equal(isServicePlugin(null), false)
})

test('current file comes from currentPluginReview', () => {
  const expected = { reviewId: CURRENT, version: '2.0.0', size: 20, sha256: 'f'.repeat(64), fileName: 'plugin.otzplugin' }
  assert.deepEqual(resolveServicePluginFile(servicePlugin()), expected)
  assert.deepEqual(resolveServicePluginFile(servicePlugin(), { version: '2.0.0' }), expected)
})

test('historical version requires a reviewId', () => {
  assert.deepEqual(resolveServicePluginFile(servicePlugin(), { version: '1.0.0' }), {
    reviewId: OLD, version: '1.0.0', size: 10, sha256: 'e'.repeat(64), fileName: 'plugin.otzplugin'
  })
  assert.equal(resolveServicePluginFile(servicePlugin(), { version: '0.9.0' }), null)
  assert.equal(resolveServicePluginFile(servicePlugin(), { version: '3.0.0' }), null)
})

test('unpublished or legacy plugins resolve to null', () => {
  assert.equal(resolveServicePluginFile(servicePlugin({ serviceState: { currentPluginReview: null } })), null)
  assert.equal(resolveServicePluginFile(servicePlugin({ serviceState: undefined })), null)
  assert.equal(resolveServicePluginFile(servicePlugin({ hasService: false })), null)
})

test('urls and messages', () => {
  assert.equal(serviceManageUrl('x'), '/plugins/x/service')
  assert.equal(pluginStoreUrl('x'), '/plugins/x')
  for (const message of Object.values(SERVICE_BLOCK_MESSAGES)) assert.match(message, /[֐-׿]/)
})

test('blocked body carries a stable code and the service page', () => {
  assert.deepEqual(serviceBlockedBody('edit', 'x'), {
    error: SERVICE_BLOCK_MESSAGES.edit,
    code: 'service_plugin_edit_blocked',
    serviceUrl: '/plugins/x/service'
  })
  assert.equal(serviceBlockedBody('unapprove', 'x').code, 'service_plugin_unapprove_blocked')
  for (const kind of ['approve', 'unapprove', 'deleteVersion', 'deleteWhileReviewing']) {
    const body = serviceBlockedBody(kind, 'x')
    assert.ok(body.error && body.code, kind)
  }
})
