/**
 * בדיקות זיהוי מערכת ההפעלה (src/lib/detectOs.js): detectOs, readDocumentOs, ושהסקריפט
 * ה-inline (OS_DETECT_SCRIPT) מחזיר בדיוק את מה ש-detectOs מחזיר. הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectOs, detectPlatform, OS_DETECT_SCRIPT, readDocumentOs } from './detectOs.js'

const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'

const CASES = [
  [{ userAgent: WIN_UA, platform: 'Win32' }, 'windows'],
  [{ userAgent: WIN_UA, platform: '' }, 'windows'],
  [{ userAgent: MAC_UA, platform: 'MacIntel' }, 'macos'],
  [{ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 }, 'mobile'],
  [{ userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile', platform: 'Linux armv8l' }, 'mobile'],
  [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone' }, 'mobile'],
  [{ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' }, 'other'],
  [{ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', platform: '' }, 'other'],
  [{}, null]
]

function runScript(nav) {
  const attrs = {}
  const document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v }, getAttribute: (k) => attrs[k] ?? null } }
  new Function('navigator', 'document', OS_DETECT_SCRIPT)(nav, document)
  return { value: attrs['data-os'] ?? null, document }
}

test('detectOs — Windows, macOS, טלפון/טאבלט (כולל iPad שמתחזה ל-Mac), Linux, לא ידוע', () => {
  for (const [input, expected] of CASES) assert.equal(detectOs(input), expected, JSON.stringify(input))
})

test('OS_DETECT_SCRIPT מסכים עם detectOs בכל המקרים', () => {
  for (const [input, expected] of CASES) assert.equal(runScript(input).value, expected, JSON.stringify(input))
})

test('OS_DETECT_SCRIPT לא נופל כש-navigator חסר שדות', () => {
  assert.doesNotThrow(() => runScript({ userAgent: undefined, platform: undefined }))
  assert.equal(runScript({ userAgent: undefined, platform: undefined }).value, null)
})

test('readDocumentOs — רק ערכים מוכרים; בלי document או בלי ערך — null', () => {
  assert.equal(readDocumentOs(runScript({ userAgent: MAC_UA, platform: 'MacIntel' }).document), 'macos')
  assert.equal(readDocumentOs(runScript({}).document), null)
  assert.equal(readDocumentOs({ documentElement: { getAttribute: () => 'beos' } }), null)
  assert.equal(readDocumentOs(undefined), null)
})

test('detectPlatform — כרטיס ההורדה בדף הבית: Android, iOS, macOS, Windows, Linux, לא ידוע', () => {
  const cases = [
    [{ userAgent: WIN_UA, platform: 'Win32' }, 'windows'],
    [{ userAgent: WIN_UA }, 'windows'],
    [{ userAgent: MAC_UA, platform: 'MacIntel' }, 'macos'],
    // iPad שמתחזה ל-Mac — macOS (לא כמו detectOs)
    [{ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 }, 'macos'],
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile', platform: 'Linux armv8l' }, 'android'],
    [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone' }, 'ios'],
    [{ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' }, 'linux'],
    [{ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', platform: '' }, null],
    [{}, null]
  ]
  for (const [input, expected] of cases) assert.equal(detectPlatform(input), expected, JSON.stringify(input))
})
