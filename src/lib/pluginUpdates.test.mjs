/**
 * בדיקות בדיקת העדכונים ב-batch של אפליקציית אוצריא. הרצה: npm test
 *
 * המקרה המרכזי: לתוסף מותקן מוצע עדכון רק כשקיימת גרסה *תואמת* גבוהה מהמותקנת —
 * גרסה חיה חדשה שדורשת אוצריא חדשה יותר איננה עדכון, אלא מדווחת כ-incompatible.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseUpdateRequestList,
  resolvePluginUpdates,
  MAX_UPDATE_REQUESTS
} from './pluginUpdates.js'

function plugin({ uid, id = '6a3b41de42427e3be09afcba', version, compatibleWith, maxAppVersion = null, versions = [] }) {
  return {
    _id: { toString: () => id },
    pluginUid: uid,
    version,
    status: 'stable',
    compatibleWith,
    maxAppVersion,
    pluginFileName: 'p.otzplugin',
    pluginFileExt: '.otzplugin',
    pluginFileSize: 100,
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    versions
  }
}

const SAMPLE = plugin({
  uid: 'org.example.sample',
  version: '2.0.0',
  compatibleWith: '0.9.96',
  versions: [
    { version: '1.5.0', compatibleWith: '0.9.94', maxAppVersion: '0.9.95', pluginFileExt: '.otzplugin', archivedAt: new Date('2026-06-01T00:00:00Z') },
    { version: '1.0.0', compatibleWith: '0.9.89', maxAppVersion: '0.9.93', pluginFileExt: '.otzplugin', archivedAt: new Date('2026-02-01T00:00:00Z') }
  ]
})

// ── parseUpdateRequestList ──────────────────────────────────────────────

test('פירוק רשימת בקשות תקינה', () => {
  const { requests } = parseUpdateRequestList('org.example.a@1.0.0, org.example.b@2.1')
  assert.deepEqual(requests, [
    { uid: 'org.example.a', installedVersion: '1.0.0' },
    { uid: 'org.example.b', installedVersion: '2.1' }
  ])
})

test('uid כפול — נשמרת הבקשה הראשונה בלבד', () => {
  const { requests } = parseUpdateRequestList('org.a@1.0.0,org.a@2.0.0')
  assert.deepEqual(requests, [{ uid: 'org.a', installedVersion: '1.0.0' }])
})

test('קלט פגום פוסל את הבקשה כולה', () => {
  assert.equal(parseUpdateRequestList('').requests, null)
  assert.equal(parseUpdateRequestList('no-version').requests, null)
  assert.equal(parseUpdateRequestList('org.a@').requests, null)
  assert.equal(parseUpdateRequestList('@1.0.0').requests, null)
  assert.equal(parseUpdateRequestList('org.a@not a version').requests, null)
  assert.equal(parseUpdateRequestList('bad uid!@1.0.0').requests, null)
})

test('יותר מהמקסימום — נפסל ולא נחתך בשקט', () => {
  const raw = Array.from({ length: MAX_UPDATE_REQUESTS + 1 }, (_, i) => `org.p${i}@1.0.0`).join(',')
  assert.equal(parseUpdateRequestList(raw).requests, null)
})

// ── resolvePluginUpdates ────────────────────────────────────────────────

test('יש עדכון: גרסה תואמת גבוהה מהמותקנת, עם downloadUrl מוצמד-גרסה', () => {
  const [r] = resolvePluginUpdates([SAMPLE], [{ uid: 'org.example.sample', installedVersion: '1.5.0' }], '0.9.97')
  assert.equal(r.hasUpdate, true)
  assert.equal(r.version, '2.0.0')
  assert.equal(r.downloadUrl, '/api/plugins/6a3b41de42427e3be09afcba@2.0.0/download')
  assert.equal(r.isLatest, true)
  assert.equal(r.incompatible, undefined)
})

test('אין עדכון: המותקנת היא הגרסה התואמת הגבוהה ביותר', () => {
  const [r] = resolvePluginUpdates([SAMPLE], [{ uid: 'org.example.sample', installedVersion: '2.0.0' }], '0.9.97')
  assert.equal(r.hasUpdate, false)
  assert.equal(r.version, '2.0.0')
})

test('גרסה חיה חדשה שאינה תואמת אינה עדכון — מוצעת התואמת הגבוהה', () => {
  // אוצריא 0.9.95: החיה 2.0.0 דורשת 0.9.96 → התואמת הגבוהה היא 1.5.0
  const [r] = resolvePluginUpdates([SAMPLE], [{ uid: 'org.example.sample', installedVersion: '1.0.0' }], '0.9.95')
  assert.equal(r.hasUpdate, true)
  assert.equal(r.version, '1.5.0')
  assert.equal(r.isLatest, false)
  assert.equal(r.downloadUrl, '/api/plugins/6a3b41de42427e3be09afcba@1.5.0/download')
})

test('אין אף גרסה תואמת → hasUpdate=false עם בלוק incompatible', () => {
  const [r] = resolvePluginUpdates([SAMPLE], [{ uid: 'org.example.sample', installedVersion: '1.0.0' }], '0.9.80')
  assert.equal(r.hasUpdate, false)
  assert.equal(r.version, undefined)
  assert.deepEqual(r.incompatible, {
    latestVersion: '2.0.0',
    compatibleWith: '0.9.96',
    maxAppVersion: null,
    minSupportedAppVersion: '0.9.89'
  })
})

test('uid שאינו בחנות מושמט בשקט', () => {
  const results = resolvePluginUpdates(
    [SAMPLE],
    [
      { uid: 'org.unknown', installedVersion: '1.0.0' },
      { uid: 'org.example.sample', installedVersion: '1.0.0' }
    ],
    '0.9.97'
  )
  assert.deepEqual(results.map((r) => r.uid), ['org.example.sample'])
})

test('גרסה מותקנת פגומה — אין הצעת עדכון שאי אפשר להשוות', () => {
  const [r] = resolvePluginUpdates([SAMPLE], [{ uid: 'org.example.sample', installedVersion: 'abc' }], '0.9.97')
  assert.equal(r.hasUpdate, false)
})

test('כמה תוספים בבקשה אחת', () => {
  const other = plugin({ uid: 'org.example.other', id: '6a3b41de42427e3be09afcbb', version: '3.0.0', compatibleWith: '0.9.90' })
  const results = resolvePluginUpdates(
    [SAMPLE, other],
    [
      { uid: 'org.example.sample', installedVersion: '2.0.0' },
      { uid: 'org.example.other', installedVersion: '2.9.0' }
    ],
    '0.9.97'
  )
  assert.equal(results.length, 2)
  assert.equal(results.find((r) => r.uid === 'org.example.sample').hasUpdate, false)
  assert.equal(results.find((r) => r.uid === 'org.example.other').hasUpdate, true)
})
