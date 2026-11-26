/**
 * בדיקת ההתקנה של otzaria-plugin-validator מול package-lock.json
 * (scripts/check-plugin-validator.cjs). הרצה: npm run test:node
 *
 * הטסט האחרון בודק את ההתקנה האמיתית בריפו: גם מי שמריץ `node --test` ישירות
 * (בלי ה-pretest של npm) יקבל הסבר ברור במקום TypeError סתום בטסטים של הוולידציה.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const { checkPluginValidatorInstall, compareVersions } = require('../../scripts/check-plugin-validator.cjs')

function fixture({ installed, locked }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'otzaria-validator-install-'))
  if (locked !== undefined) {
    const packages = locked === null ? {} : {
      'node_modules/otzaria-plugin-validator': { version: locked, resolved: 'git+ssh://example/validator.git#abc123' },
    }
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages }))
  }
  if (installed !== undefined) {
    const dir = path.join(root, 'node_modules', 'otzaria-plugin-validator')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'otzaria-plugin-validator', version: installed }))
  }
  return { root, clean: () => fs.rmSync(root, { recursive: true, force: true }) }
}

function check(options) {
  const f = fixture(options)
  try { return checkPluginValidatorInstall(f.root) } finally { f.clean() }
}

test('compareVersions: השוואה מספרית לפי רכיבים, לא מחרוזתית', () => {
  assert.ok(compareVersions('1.9.0', '1.19.1') < 0)
  assert.ok(compareVersions('1.19.1', '1.14.1') > 0)
  assert.equal(compareVersions('1.19.1', '1.19.1'), 0)
  assert.equal(compareVersions('v2.0.0', '2.0.0'), 0)
  assert.equal(compareVersions('1.19.1-beta', '1.19.1'), 0)
  assert.equal(compareVersions('latest', '1.0.0'), null)
  assert.equal(compareVersions(undefined, '1.0.0'), null)
})

test('התקנה ישנה מה-lock נכשלת עם שתי הגרסאות והפקודה לתיקון', () => {
  const result = check({ installed: '1.14.1', locked: '1.19.1' })
  assert.equal(result.ok, false)
  assert.equal(result.installedVersion, '1.14.1')
  assert.equal(result.lockedVersion, '1.19.1')
  assert.match(result.message, /1\.14\.1/)
  assert.match(result.message, /1\.19\.1/)
  assert.match(result.message, /npm ci/)
})

test('גרסה זהה ל-lock תקינה ושקטה', () => {
  const result = check({ installed: '1.19.1', locked: '1.19.1' })
  assert.equal(result.ok, true)
  assert.equal(result.message, '')
})

test('גרסה חדשה מה-lock תקינה — כך נראית בנייה שרועננה ל-#v1 בלי --save', () => {
  const result = check({ installed: '1.20.0', locked: '1.19.1' })
  assert.equal(result.ok, true)
  assert.match(result.message, /1\.20\.0/)
})

test('חבילה שאינה מותקנת נכשלת', () => {
  const result = check({ locked: '1.19.1' })
  assert.equal(result.ok, false)
  assert.equal(result.installedVersion, null)
  assert.match(result.message, /npm ci/)
})

test('בלי רשומה ב-lock או עם גרסה שאינה ניתנת להשוואה — לא חוסם', () => {
  assert.equal(check({ installed: '1.19.1', locked: null }).ok, true)
  assert.equal(check({ installed: '1.19.1' }).ok, true)
  assert.equal(check({ installed: 'next', locked: '1.19.1' }).ok, true)
})

test('כ-CLI (pretest): התקנה ישנה יוצאת בקוד 1 עם ההסבר ב-stderr', () => {
  const f = fixture({ installed: '1.14.1', locked: '1.19.1' })
  try {
    const script = path.resolve(import.meta.dirname, '../../scripts/check-plugin-validator.cjs')
    const run = spawnSync(process.execPath, [script], { cwd: f.root, encoding: 'utf8' })
    assert.equal(run.status, 1)
    assert.match(run.stderr, /1\.14\.1.*1\.19\.1/)
  } finally { f.clean() }
})

test('ההתקנה בריפו הזה אינה ישנה מ-package-lock.json', () => {
  const result = checkPluginValidatorInstall(path.resolve(import.meta.dirname, '../..'))
  assert.ok(result.ok, result.message)
})

// --- שער הייצואים בזמן import (pluginValidationCore.js / pluginValidation.js) ---
// import דינמי: בהתקנה ישנה ה-import עצמו נכשל (בהודעה הברורה), ובדיקות ההתקנה
// שלמעלה חייבות לרוץ בכל זאת ולהציג את הגרסאות.
const loadGuard = async () => (await import('./pluginValidationCore.js')).assertPluginValidatorExports

test('שער הייצואים: חבילה תקינה עוברת בלי לזרוק', async () => {
  const assertPluginValidatorExports = await loadGuard()
  const validator = (await import('otzaria-plugin-validator')).default
  assert.doesNotThrow(() => assertPluginValidatorExports(validator, ['SPEC', 'getApiSpec', 'analyzeApiUsage']))
})

test('שער הייצואים: חבילה ישנה (main שאינו מייצא דבר) נכשלת בשמות החסרים ובפקודה לתיקון', async () => {
  const assertPluginValidatorExports = await loadGuard()
  for (const stale of [{}, undefined, null]) {
    assert.throws(
      () => assertPluginValidatorExports(stale, ['SPEC', 'getApiSpec']),
      (err) => /SPEC, getApiSpec/.test(err.message) && /npm ci/.test(err.message) && /check:plugin-validator/.test(err.message)
    )
  }
})

test('שער הייצואים: מדווח רק על החסרים, וערך falsy שאינו undefined נחשב קיים', async () => {
  const assertPluginValidatorExports = await loadGuard()
  assert.throws(
    () => assertPluginValidatorExports({ SPEC: {}, flag: false, count: 0 }, ['SPEC', 'flag', 'count', 'scanCodeForApiUsage']),
    (err) => err.message.includes('הייצואים scanCodeForApiUsage.')
  )
})
