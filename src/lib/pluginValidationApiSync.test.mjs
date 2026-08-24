/**
 * בדיקות סנכרון מול ה-API של אוצריא, במסלול ה-FALLBACK. הרצה: npm test
 *
 * הרקע: כשהבאת API_REFERENCE.md מגיטהאב נכשלת (רשת מסוננת) הוולידציה נופלת
 * לרשימות המקומיות. תוסף חייב לקבל אותה תשובה בשני המסלולים — אחרת הקבלה
 * לחנות תלויה בזמינות רשת.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { validatePluginArchive } from './pluginValidation.js'

function buildArchive({ permissions = [], minAppVersion = '0.9.97', indexJs = '', network } = {}) {
  const manifest = {
    schemaVersion: 1,
    id: 'test.apisync',
    name: 'בדיקה',
    version: '1.0.0',
    description: 'תוסף בדיקה לסנכרון ה-API',
    author: 'בודק',
    entrypoint: 'index.html',
    minAppVersion,
    permissions,
    ...(network ? { network } : {})
  }
  return Buffer.from(zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'index.html': strToU8(
      '<!doctype html><html dir="rtl" lang="he"><body><script src="index.js"></script></body></html>'
    ),
    'index.js': strToU8(indexJs)
  }))
}

test('ספקי חיפוש-בספר וחיפוש חיצוני מוכרים גם בלי הבאה מגיטהאב', async () => {
  const result = await validatePluginArchive(buildArchive({
    permissions: ['reader.open'],
    indexJs: [
      "Otzaria.call('reader.registerInBookSearchProvider', { provider: 'x' })",
      "Otzaria.call('reader.respondInBookSearch', { requestId: 1 })",
      "Otzaria.call('reader.registerExternalSearchProvider', { provider: 'x' })",
      "Otzaria.call('reader.respondExternalSearch', { requestId: 1 })"
    ].join('\n')
  }))

  const noise = [...result.errors, ...result.warnings].filter((m) =>
    m.includes('SearchProvider') || m.includes('respondInBookSearch') || m.includes('respondExternalSearch')
  )
  assert.deepEqual(noise, [], noise.join(' | '))
})

test('reader.inBookSearch.requested ו-ui.messageClicked הם אירועים מוכרים', async () => {
  const result = await validatePluginArchive(buildArchive({
    permissions: ['reader.open'],
    indexJs: [
      "Otzaria.on('reader.inBookSearch.requested', () => {})",
      "Otzaria.on('ui.messageClicked', () => {})"
    ].join('\n')
  }))

  const noise = [...result.errors, ...result.warnings].filter(
    (m) => m.includes('inBookSearch') || m.includes('messageClicked')
  )
  assert.deepEqual(noise, [], noise.join(' | '))
})

test('calendar.getDailyTimes זמין מ-0.9.92 ואינו חוסם תוסף ותיק', async () => {
  const result = await validatePluginArchive(buildArchive({
    permissions: ['calendar.read'],
    minAppVersion: '0.9.92',
    indexJs: "Otzaria.call('calendar.getDailyTimes', {})"
  }))

  const noise = [...result.errors, ...result.warnings].filter((m) => m.includes('getDailyTimes'))
  assert.deepEqual(noise, [], noise.join(' | '))
})

test('host מקומי חשוף ב-network.allowlist נחשב תקין (כמו באוצריא)', async () => {
  const result = await validatePluginArchive(buildArchive({
    permissions: ['network.access'],
    network: { enabled: true, allowlist: ['127.0.0.1', 'localhost', 'https://api.example.com'] }
  }))

  const noise = result.errors.filter((m) => m.includes('network.allowlist'))
  assert.deepEqual(noise, [], noise.join(' | '))
})

test('כתובת בלי סכימה שאינה loopback נשארת שגיאה', async () => {
  const result = await validatePluginArchive(buildArchive({
    permissions: ['network.access'],
    network: { enabled: true, allowlist: ['api.example.com'] }
  }))

  assert.ok(
    result.errors.some((m) => m.includes('network.allowlist')),
    `ציפינו לשגיאה על api.example.com, קיבלנו: ${result.errors.join(' | ')}`
  )
})
