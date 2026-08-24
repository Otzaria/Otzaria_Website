/**
 * בדיקות רמות הממצא בוולידציית תוסף. הרצה: npm test
 *
 * הרקע: נתיבי ההעלאה והעריכה פוסלים על errors ועל warnings גם יחד. לכן ממצא
 * שאינו אי-תאימות אמיתית — "ההרשאה הזו ניתנת כיום אוטומטית, אפשר להסירה" —
 * חייב להיות advisory. כשהוא היה warning הוא חסם כל עדכון של כל תוסף שמצהיר
 * הרשאת בסיס, כולל תוסף החנות עצמו.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { validatePluginArchive } from './pluginValidation.js'

const BASELINE_DECLARED = [
  'plugin.storage.read',
  'plugin.storage.write',
  'app.info.read',
  'notifications.send',
  'events.subscribe:theme.changed'
]

/** בונה .otzplugin מינימלי ותקין (ZIP בזיכרון) עם ההרשאות שנבדקות */
function buildArchive(permissions) {
  const manifest = {
    schemaVersion: 1,
    id: 'test.advisories',
    name: 'בדיקה',
    version: '1.0.0',
    description: 'תוסף בדיקה לרמות הממצא',
    author: 'בודק',
    entrypoint: 'index.html',
    minAppVersion: '0.9.97',
    permissions
  }
  return Buffer.from(zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'index.html': strToU8('<!doctype html><html dir="rtl" lang="he"><body></body></html>')
  }))
}

test('הצהרה על הרשאות בסיס היא advisory ואינה חוסמת פרסום', async () => {
  const result = await validatePluginArchive(buildArchive(BASELINE_DECLARED))

  // כל הרשאת בסיס מוצהרת מקבלת המלצת ניקיון
  assert.equal(result.advisories.length, BASELINE_DECLARED.length)
  for (const permission of BASELINE_DECLARED) {
    assert.ok(
      result.advisories.some((message) => message.includes(permission)),
      `חסרה המלצה עבור ${permission}`
    )
  }

  // ...ולא אזהרה. זו הנקודה: השער בהעלאה/עריכה הוא errors + warnings.
  assert.deepEqual(result.warnings.filter((m) => m.includes('אוטומטית')), [])
  assert.deepEqual([...result.errors, ...result.warnings], [])
})

test('תוסף בלי הרשאות כלל אינו מקבל המלצות', async () => {
  const result = await validatePluginArchive(buildArchive([]))
  assert.deepEqual(result.advisories, [])
  assert.deepEqual([...result.errors, ...result.warnings], [])
})

test('שדה advisories קיים תמיד, גם בכשל קריאה של הארכיון', async () => {
  const result = await validatePluginArchive(Buffer.from('not a zip at all'))
  assert.ok(result.errors.length > 0)
  assert.ok(Array.isArray(result.advisories))
})

test('schemaVersion שאינו 1 הוא שגיאה חוסמת בחנות', async () => {
  const manifest = {
    schemaVersion: 2,
    id: 'test.schema',
    name: 'בדיקה',
    version: '1.0.0',
    description: 'בדיקת סכמה',
    author: 'בודק',
    entrypoint: 'index.html',
    minAppVersion: '0.9.97',
    permissions: []
  }
  const buffer = Buffer.from(zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'index.html': strToU8('<!doctype html><html dir="rtl" lang="he"><body></body></html>')
  }))
  const result = await validatePluginArchive(buffer)
  assert.ok(
    result.errors.some((e) => e.includes('סכמה')),
    'expected blocking schemaVersion error: ' + result.errors.join(' | ')
  )
})
