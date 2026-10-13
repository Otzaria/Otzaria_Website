/**
 * בדיקות שדה "platforms" בוולידציית ההעלאה לחנות. הרצה: npm test
 *
 * הכלל עצמו (צורת השדה) וההסקה מהקוד חיים בוולידטור החיצוני; כאן נבדקת מדיניות
 * החנות: ערך פגום חוסם (error), וסתירה בין ההצהרה לקוד היא advisory בלבד — כי
 * ההעלאה פוסלת על כל warning, וההסקה היא היוריסטיקה.
 *
 * הבדיקות מדולגות מול גרסת וולידטור שקדמה לשדה (החנות מקבלת את ראש v1 בבנייה).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import otzariaValidator from 'otzaria-plugin-validator'
import { validatePluginArchive } from './pluginValidation.js'

const SKIP = otzariaValidator.MANIFEST_RULES?.platforms && typeof otzariaValidator.analyzePlatforms === 'function'
  ? false
  : 'otzaria-plugin-validator ללא תמיכה ב-platforms'

function buildArchive(manifestOverrides = {}, script = '') {
  const manifest = {
    schemaVersion: 1,
    id: 'test.platforms',
    name: 'בדיקה',
    version: '1.0.0',
    description: 'תוסף בדיקה לפלטפורמות',
    author: 'בודק',
    entrypoint: 'index.html',
    minAppVersion: '0.9.98',
    permissions: [],
    ...manifestOverrides
  }
  return Buffer.from(zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'index.html': strToU8(`<!doctype html><html dir="rtl" lang="he"><body><script>${script}</script></body></html>`)
  }))
}

test('platforms תקין עובר ומוחזר בתוצאה', { skip: SKIP }, async () => {
  const result = await validatePluginArchive(buildArchive({ platforms: ['windows', 'linux'] }))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.platforms.declared, ['windows', 'linux'])
})

test('platforms עם ערך לא מוכר / כפילות / ריק — שגיאה חוסמת', { skip: SKIP }, async () => {
  for (const platforms of [['windows', 'web'], ['linux', 'linux'], [], 'windows']) {
    const result = await validatePluginArchive(buildArchive({ platforms }))
    assert.ok(result.errors.some((m) => m.includes('platforms')), JSON.stringify(platforms))
  }
})

test('סתירה בין הצהרה לקוד היא advisory ולא warning', { skip: SKIP }, async () => {
  const result = await validatePluginArchive(
    buildArchive({ platforms: ['windows', 'android'] }, "Otzaria.call('shortcut.create', { label: 'x' })")
  )
  assert.ok(result.advisories.some((m) => m.includes('shortcut.create') && m.includes('android')), result.advisories.join(' | '))
  assert.deepEqual(result.warnings.filter((m) => m.includes('platforms')), [])
  assert.deepEqual(result.errors, [])
})

test('שדה חסר אינו שגיאה, וההסקה מוחזרת', { skip: SKIP }, async () => {
  const result = await validatePluginArchive(buildArchive({}, "Otzaria.call('ui.print')"))
  assert.deepEqual(result.errors, [])
  assert.equal(result.platforms.declared, null)
  assert.deepEqual(result.platforms.inferred, ['windows', 'linux', 'macos', 'ios'])
})
