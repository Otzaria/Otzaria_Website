/**
 * בדיקות בחירת גרסת התוסף המתאימה לגרסת אוצריא. הרצה: npm test
 *
 * המקרה המרכזי: משתמש בגרסת אוצריא ישנה חייב לקבל את הבילד האחרון שעוד תמך בו
 * ולא את הגרסה החיה שדורשת אפליקציה חדשה יותר.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidAppVersion,
  isCompatibleWithApp,
  buildVersionEntries,
  resolveCompatibleVersion,
  lowestSupportedAppVersion
} from './pluginCompatibility.js'

/** תוסף מדומה: הגרסה החיה + היסטוריית גרסאות, כמו במסמך ה-DB */
function plugin({ version, compatibleWith, maxAppVersion = null, versions = [] }) {
  return {
    _id: { toString: () => '6a3b41de42427e3be09afcba' },
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
  version: '2.0.0',
  compatibleWith: '0.9.96',
  versions: [
    { version: '1.5.0', compatibleWith: '0.9.94', maxAppVersion: '0.9.95', pluginFileExt: '.otzplugin', archivedAt: new Date('2026-06-01T00:00:00Z') },
    { version: '1.0.0', compatibleWith: '0.9.89', maxAppVersion: '0.9.93', pluginFileExt: '.otzplugin', archivedAt: new Date('2026-02-01T00:00:00Z') },
    { version: '1.2.0', compatibleWith: '0.9.94', maxAppVersion: null, pluginFileExt: '.otzplugin', archivedAt: new Date('2026-04-01T00:00:00Z') }
  ]
})

test('רשימת הגרסאות ממוינת מהגבוהה לנמוכה, החיה מסומנת isLatest', () => {
  const entries = buildVersionEntries(SAMPLE)
  assert.deepEqual(entries.map((e) => e.version), ['2.0.0', '1.5.0', '1.2.0', '1.0.0'])
  assert.equal(entries[0].isLatest, true)
  assert.equal(entries.filter((e) => e.isLatest).length, 1)
  assert.equal(entries[0].downloadUrl, '/api/plugins/6a3b41de42427e3be09afcba/download')
  assert.equal(entries[1].downloadUrl, '/api/plugins/6a3b41de42427e3be09afcba@1.5.0/download')
})

test('גרסת אוצריא חדשה מקבלת את הגרסה החיה', () => {
  assert.equal(resolveCompatibleVersion(SAMPLE, '0.9.96').version, '2.0.0')
  assert.equal(resolveCompatibleVersion(SAMPLE, '1.0.0').version, '2.0.0')
})

test('גרסת אוצריא ישנה מקבלת את הגרסה הגבוהה ביותר שעוד תומכת בה', () => {
  // 0.9.95: 2.0.0 דורשת 0.9.96, 1.5.0 תומכת עד 0.9.95 → 1.5.0 (גבוהה מ-1.2.0)
  assert.equal(resolveCompatibleVersion(SAMPLE, '0.9.95').version, '1.5.0')
  // 0.9.94: גם 1.5.0 וגם 1.2.0 תואמות → הגבוהה
  assert.equal(resolveCompatibleVersion(SAMPLE, '0.9.94').version, '1.5.0')
  // 0.9.93: רק 1.0.0 (מקסימום 0.9.93)
  assert.equal(resolveCompatibleVersion(SAMPLE, '0.9.93').version, '1.0.0')
})

test('אין גרסה תואמת → null', () => {
  assert.equal(resolveCompatibleVersion(SAMPLE, '0.9.88'), null)
})

test('תקרה חסרה = ללא הגבלה עליונה', () => {
  const p = plugin({ version: '1.0.0', compatibleWith: '0.9.89' })
  assert.equal(resolveCompatibleVersion(p, '5.0.0').version, '1.0.0')
})

test('גרסת מינימום חסרה ברשומה היסטורית = ללא גבול תחתון', () => {
  // תוספים שאורכבו לפני שנשמרו שדות התאימות מגיעים עם compatibleWith ריק
  const p = plugin({
    version: '2.0.0',
    compatibleWith: '0.9.96',
    versions: [{ version: '1.0.0', compatibleWith: '', maxAppVersion: null, archivedAt: new Date('2026-01-01T00:00:00Z') }]
  })
  assert.equal(resolveCompatibleVersion(p, '0.9.89').version, '1.0.0')
})

test('טווח התאימות נבדק בשני הכיוונים כולל הקצוות', () => {
  const entry = { compatibleWith: '0.9.94', maxAppVersion: '0.9.95' }
  assert.equal(isCompatibleWithApp(entry, '0.9.93'), false)
  assert.equal(isCompatibleWithApp(entry, '0.9.94'), true)
  assert.equal(isCompatibleWithApp(entry, '0.9.95'), true)
  assert.equal(isCompatibleWithApp(entry, '0.9.96'), false)
})

test('הרצפה הנמוכה מכל הגרסאות, ולא זו של הגרסה החיה', () => {
  // החיה דורשת 0.9.96, אבל 1.0.0 עוד רצה על 0.9.89
  assert.equal(lowestSupportedAppVersion(SAMPLE), '0.9.89')
})

test('אין רצפה כשלגרסה כלשהי אין דרישת מינימום', () => {
  const p = plugin({
    version: '2.0.0',
    compatibleWith: '0.9.96',
    versions: [
      { version: '1.0.0', compatibleWith: '', maxAppVersion: '0.9.93', archivedAt: new Date('2026-02-01T00:00:00Z') }
    ]
  })

  assert.equal(lowestSupportedAppVersion(p), null)
})

test('רצפה של תוסף בעל גרסה חיה בלבד', () => {
  assert.equal(
    lowestSupportedAppVersion(plugin({ version: '1.0.0', compatibleWith: '0.9.94' })),
    '0.9.94'
  )
})

test('נתון גרסה פגום אינו מפיל את חישוב הרצפה', () => {
  const p = plugin({
    version: '2.0.0',
    compatibleWith: 'not-a-version',
    versions: [
      { version: '1.0.0', compatibleWith: '0.9.89', archivedAt: new Date('2026-02-01T00:00:00Z') }
    ]
  })

  assert.equal(lowestSupportedAppVersion(p), null)
})

test('ולידציה של גרסת אוצריא נשלחת', () => {
  assert.equal(isValidAppVersion('0.9.94'), true)
  assert.equal(isValidAppVersion('1'), true)
  assert.equal(isValidAppVersion('1.0.0-beta.1'), true)
  assert.equal(isValidAppVersion(''), false)
  assert.equal(isValidAppVersion('latest'), false)
  assert.equal(isValidAppVersion('0.9.94; rm -rf'), false)
  assert.equal(isValidAppVersion('../../etc'), false)
})
