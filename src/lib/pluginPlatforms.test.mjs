/**
 * בדיקות מודול הפלטפורמות של תוסף (src/lib/pluginPlatforms.js). הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLUGIN_PLATFORM_IDS,
  PLUGIN_PLATFORMS,
  normalizeManifestPlatforms,
  hasPlatformRestriction,
  pluginSupportsPlatform,
  parsePlatformParam,
  detectPlatformFromUserAgent,
  initialPlatformFilter,
  getPlatformInfo
} from './pluginPlatforms.js'

test('רשימת הפלטפורמות תואמת לערכי Platform.operatingSystem של אוצריא', () => {
  assert.deepEqual(PLUGIN_PLATFORM_IDS, ['windows', 'linux', 'macos', 'android', 'ios'])
  assert.deepEqual(PLUGIN_PLATFORMS.map((p) => p.id), PLUGIN_PLATFORM_IDS)
  assert.equal(getPlatformInfo('macos').label, 'macOS')
  assert.equal(getPlatformInfo('web'), null)
})

test('normalizeManifestPlatforms: סדר קנוני, בלי כפילויות ובלי ערכים לא מוכרים', () => {
  assert.deepEqual(normalizeManifestPlatforms(['ios', 'windows', 'ios', 'Web', 3]), ['windows', 'ios'])
  assert.deepEqual(normalizeManifestPlatforms(undefined), [])
  assert.deepEqual(normalizeManifestPlatforms('windows'), [])
  assert.deepEqual(normalizeManifestPlatforms([]), [])
})

test('hasPlatformRestriction: רק רשימה חלקית נחשבת הגבלה', () => {
  assert.equal(hasPlatformRestriction(['windows']), true)
  assert.equal(hasPlatformRestriction([]), false)
  assert.equal(hasPlatformRestriction(undefined), false)
  assert.equal(hasPlatformRestriction([...PLUGIN_PLATFORM_IDS]), false)
})

test('pluginSupportsPlatform: תוסף ללא הצהרה זמין בכל הפלטפורמות', () => {
  assert.equal(pluginSupportsPlatform({ platforms: [] }, 'android'), true)
  assert.equal(pluginSupportsPlatform({}, 'ios'), true)
  assert.equal(pluginSupportsPlatform({ platforms: ['windows', 'linux'] }, 'linux'), true)
  assert.equal(pluginSupportsPlatform({ platforms: ['windows', 'linux'] }, 'android'), false)
  // 'all' או ערך לא מוכר — ללא סינון
  assert.equal(pluginSupportsPlatform({ platforms: ['windows'] }, 'all'), true)
  assert.equal(pluginSupportsPlatform({ platforms: ['windows'] }, 'web'), true)
})

test('parsePlatformParam', () => {
  assert.equal(parsePlatformParam('Android'), 'android')
  assert.equal(parsePlatformParam(' all '), 'all')
  assert.equal(parsePlatformParam('web'), null)
  assert.equal(parsePlatformParam(null), null)
})

test('detectPlatformFromUserAgent', () => {
  const cases = [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 'macos'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'linux'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 'ios'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/120 Safari/537.36', null],
    ['', null],
    [undefined, null]
  ]
  for (const [ua, expected] of cases) {
    assert.equal(detectPlatformFromUserAgent(ua), expected, String(ua))
  }
})

test('initialPlatformFilter: ?platform= גובר על ה-UA ונשמר ב-URL; זיהוי אוטומטי לא', () => {
  const winUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  assert.deepEqual(initialPlatformFilter('linux', winUa), { platform: 'linux', fromUrl: true })
  assert.deepEqual(initialPlatformFilter('all', winUa), { platform: 'all', fromUrl: true })
  assert.deepEqual(initialPlatformFilter(null, winUa), { platform: 'windows', fromUrl: false })
  assert.deepEqual(initialPlatformFilter('bogus', 'curl/8'), { platform: 'all', fromUrl: false })
})
