/**
 * בדיקות pluginStatus — קבועי הסטטוס/התאימות הבטוחים-ללקוח. הרצה: npm test
 *
 * מעבר לערכים עצמם, נבדק שהמודול ושרשרת pluginCompatibility נשארים נקיים
 * מייבוא מודולי node (path/zlib/fs...): רכיבי 'use client' בחנות התוספים
 * מייבאים אותם, וייבוא כזה היה מחזיר ~60KB gz של polyfills לדפדפן.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ALLOWED_PLUGIN_STATUSES,
  PLUGIN_STATUS_LABELS,
  MIN_SUPPORTED_APP_VERSION,
  formatPluginStatus
} from './pluginStatus.js'

test('formatPluginStatus מחזיר תווית עברית לכל סטטוס מותר', () => {
  assert.deepEqual(ALLOWED_PLUGIN_STATUSES, ['stable', 'beta', 'experimental'])
  assert.equal(formatPluginStatus('stable'), 'יציב')
  assert.equal(formatPluginStatus('beta'), 'בטא')
  assert.equal(formatPluginStatus('experimental'), 'ניסיוני')
  for (const status of ALLOWED_PLUGIN_STATUSES) {
    assert.equal(formatPluginStatus(status), PLUGIN_STATUS_LABELS[status])
  }
})

test('formatPluginStatus מחזיר "לא ידוע" לסטטוס לא מוכר', () => {
  assert.equal(formatPluginStatus('archived'), 'לא ידוע')
  assert.equal(formatPluginStatus(undefined), 'לא ידוע')
})

test('MIN_SUPPORTED_APP_VERSION בפורמט major.minor.patch', () => {
  assert.match(MIN_SUPPORTED_APP_VERSION, /^\d+\.\d+\.\d+$/)
})

const NODE_BUILTIN_IMPORT_RE = /from\s+['"](?:node:)?(?:path|zlib|fs|stream|crypto|buffer|util|os)['"]|from\s+['"]\.\/pluginManifest(?:\.js)?['"]/

test('המודולים שנצרכים ע"י רכיבי לקוח אינם מייבאים מודולי node', () => {
  for (const file of ['./pluginStatus.js', './pluginCompatibility.js', './semverCompare.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, NODE_BUILTIN_IMPORT_RE, file)
  }
})
