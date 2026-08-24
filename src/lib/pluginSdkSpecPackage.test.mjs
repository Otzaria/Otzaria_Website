/**
 * מפרט ה-SDK לתוספים כפי שהוא מגיע מחבילת otzaria-plugin-validator. הרצה: npm test
 *
 * המפרט מחולל בריפו של אוצריא מקוד האפליקציה, והעותק כאן הוא הרצפה שהוולידציה
 * עובדת מולה גם בלי רשת. הבדיקה מוודאת שהעותק שלם ועקבי — עותק קטוע היה
 * מקבל תוסף שאוצריא דוחה, או להפך, בשקט.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PLUGIN_SDK_SPEC, getApiSpec, _resetApiSpecCacheForTests } from './pluginValidation.js'

test('המפרט המצורף בסכימה נתמכת ועם כל השדות', () => {
  assert.equal(PLUGIN_SDK_SPEC.schemaVersion, 1)
  for (const field of [
    'permissions', 'baselinePermissions', 'legacyPermissionAliases',
    'apiMethods', 'undocumentedApiMethods', 'methodPermissions',
    'methodMinVersions', 'events', 'settings', 'manifest', 'versions'
  ]) {
    assert.ok(field in PLUGIN_SDK_SPEC, `שדה חסר: ${field}`)
  }
  assert.ok(PLUGIN_SDK_SPEC.apiMethods.length > 80)
  assert.ok(PLUGIN_SDK_SPEC.permissions.length > 30)
  assert.ok(PLUGIN_SDK_SPEC.events.length > 10)
  assert.equal(PLUGIN_SDK_SPEC.settings.policy, 'blocklist')
  for (const field of ['blockedSubstrings', 'blockedPrefixes', 'blockedKeys']) {
    assert.ok(Array.isArray(PLUGIN_SDK_SPEC.settings[field]), `שדה חסר: settings.${field}`)
    assert.ok(PLUGIN_SDK_SPEC.settings[field].length > 0)
  }
  assert.ok(PLUGIN_SDK_SPEC.manifest.stability.includes('stable'))
  assert.match(PLUGIN_SDK_SPEC.versions.whenCondition, /^\d+\.\d+\.\d+$/)
})

test('המפרט עקבי: כל method מוכר, בעל גרסה, ודורש הרשאה תקפה', () => {
  const known = new Set([
    ...PLUGIN_SDK_SPEC.apiMethods,
    ...PLUGIN_SDK_SPEC.undocumentedApiMethods
  ])
  const permissions = new Set(PLUGIN_SDK_SPEC.permissions)

  for (const method of Object.keys(PLUGIN_SDK_SPEC.methodPermissions)) {
    assert.ok(known.has(method), `הרשאה ל-method לא מוכר: ${method}`)
  }
  for (const [method, permission] of Object.entries(PLUGIN_SDK_SPEC.methodPermissions)) {
    assert.ok(permissions.has(permission), `${method} דורש הרשאה לא תקפה: ${permission}`)
  }
  for (const method of PLUGIN_SDK_SPEC.apiMethods) {
    assert.ok(PLUGIN_SDK_SPEC.methodMinVersions[method], `אין גרסת מינימום ל-${method}`)
  }
})

test('בלי רשת נטען העותק המצורף, על המשטח המלא', async () => {
  _resetApiSpecCacheForTests()
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => Promise.reject(new Error('offline'))
  try {
    const spec = await getApiSpec()
    assert.equal(spec.source, 'fallback')
    for (const method of PLUGIN_SDK_SPEC.apiMethods) {
      assert.ok(spec.apiMethods.has(method), `method חסר במסלול ללא רשת: ${method}`)
    }
    for (const permission of PLUGIN_SDK_SPEC.permissions) {
      assert.ok(spec.permissions.has(permission), `הרשאה חסרה: ${permission}`)
    }
    assert.equal(
      spec.methodMinVersions.size,
      Object.keys(PLUGIN_SDK_SPEC.methodMinVersions).length
    )
  } finally {
    globalThis.fetch = originalFetch
    _resetApiSpecCacheForTests()
  }
})
