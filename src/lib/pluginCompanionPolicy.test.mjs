/**
 * מדיניות החנות על קובץ הרצה בתוך חבילת התוסף. הרצה: npm test
 *
 * הרקע: אוצריא מחלצת כל רשומה שבחבילה לתיקיית התוסף, ולתוסף אין (במכוון) שום
 * הרשאת הרצה — כלומר בינארי שנארז בפנים רק תופח בכל התקנה ואיש לא יריץ אותו.
 * תוסף שצריך תוכנה שרצה מחוץ לאוצריא מעלה את המתקין בשדה נפרד, ולכן ההעלאה
 * חוסמת קובץ הרצה בחבילה ומפנה לשדה ההוא.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { validatePluginArchive } from './pluginValidation.js'

/** בונה .otzplugin מינימלי ותקין, עם רשומות נוספות לפי הצורך */
function buildArchive(extraEntries = {}) {
  const manifest = {
    schemaVersion: 1,
    id: 'test.companion.policy',
    name: 'בדיקה',
    version: '1.0.0',
    description: 'תוסף בדיקה למדיניות קובצי הרצה',
    author: 'בודק',
    entrypoint: 'index.html',
    minAppVersion: '0.9.97',
    permissions: []
  }
  return Buffer.from(zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'index.html': strToU8('<!doctype html><html dir="rtl" lang="he"><body></body></html>'),
    ...extraEntries
  }))
}

/** הממצא היחיד שהבדיקות כאן עוסקות בו */
function executableErrors(result) {
  return result.errors.filter((message) => message.includes('קבצי הרצה'))
}

test('חבילה של קבצי web בלבד עוברת, ואין בה ממצא על קובצי הרצה', async () => {
  const result = await validatePluginArchive(buildArchive({
    'css/style.css': strToU8('body { direction: rtl; }'),
    'js/app.js': strToU8('// אין כאן שום קריאת API'),
    'icon/icon.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  }))

  assert.deepEqual(executableErrors(result), [])
  // הבסיס עצמו חייב להיות בר-פרסום, אחרת הבדיקה הדיפרנציאלית שלמטה חסרת משמעות
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.warnings, [])
})

test('קובץ הרצה בחבילה חוסם, נוקב בשם הקובץ, ומפנה לשדה התוכנה הנלווית', async () => {
  const result = await validatePluginArchive(buildArchive({
    'bin/chavruta-setup.exe': new Uint8Array([0x4d, 0x5a, 0x90, 0x00])
  }))

  const found = executableErrors(result)
  assert.equal(found.length, 1)
  assert.match(found[0], /bin\/chavruta-setup\.exe/)
  assert.match(found[0], /תוכנה נלווית/)
  // חוסם בפועל: נתיבי ההעלאה והעריכה פוסלים על errors
  assert.ok(result.errors.includes(found[0]))
})

test('כל סוגי ההרצה מנויים יחד, כולל אות גדולה וספרייה נייטיבית', async () => {
  const result = await validatePluginArchive(buildArchive({
    'setup.EXE': new Uint8Array([0x4d, 0x5a]),
    'native/engine.dll': new Uint8Array([0x4d, 0x5a]),
    'tools/install.sh': strToU8('#!/bin/sh\necho hi\n'),
    'pkg/app.AppImage': new Uint8Array([0x7f, 0x45, 0x4c, 0x46])
  }))

  const found = executableErrors(result)
  assert.equal(found.length, 1)
  for (const name of ['setup.EXE', 'native/engine.dll', 'tools/install.sh', 'pkg/app.AppImage']) {
    assert.match(found[0], new RegExp(name.replace(/[.\\/]/g, '\\$&')))
  }
})

test('שם שרק נראה כקובץ הרצה אינו נחסם — הסיומת האמיתית היא הקובעת', async () => {
  const result = await validatePluginArchive(buildArchive({
    'docs/how-to-run.exe.txt': strToU8('הסבר על הרצת המתקין'),
    'docs/setup-notes.md': strToU8('# התקנה'),
    'js/installer.js': strToU8('// שם מטעה, קובץ JS רגיל')
  }))

  assert.deepEqual(executableErrors(result), [])
})

test('חבילה פגומה אינה מפילה את סריקת קובצי ההרצה', async () => {
  const result = await validatePluginArchive(Buffer.from('זה בכלל לא ZIP'))

  // הכשל מדווח כשגיאת קריאה, לא כממצא מדיניות, והפונקציה אינה זורקת
  assert.deepEqual(executableErrors(result), [])
  assert.ok(result.errors.length > 0)
})
