import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_INSTALLED_SERVICES,
  buildCompanionService,
  filterByInstalledServices,
  isVisibleForInstalledServices,
  normalizeServiceId,
  parseInstalledServices,
  serializeServiceForPublic,
  serviceFromDoc
} from './pluginCompanionService.js'

test('normalizeServiceId מוריד רווחים ומאותיות גדולות', () => {
  assert.equal(normalizeServiceId('  Hevruta-Bridge  '), 'hevruta-bridge')
  assert.equal(normalizeServiceId(null), '')
})

test('buildCompanionService מקבל הצהרה תקינה ומנרמל אותה', () => {
  assert.deepEqual(
    buildCompanionService({ id: 'Hevruta-Bridge', minVersion: '1.2.0', hideUnlessInstalled: true }),
    { id: 'hevruta-bridge', minVersion: '1.2.0', hideUnlessInstalled: true }
  )
})

test('buildCompanionService בלי מזהה מחזיר הצהרה ריקה', () => {
  assert.deepEqual(
    buildCompanionService({}),
    { id: '', minVersion: '', hideUnlessInstalled: false }
  )
})

test('buildCompanionService פוסל הסתרה בלי מזהה שירות', () => {
  assert.throws(
    () => buildCompanionService({ hideUnlessInstalled: true }),
    /מזהה שירות/
  )
})

test('buildCompanionService פוסל מזהה עם תווים אסורים', () => {
  assert.throws(() => buildCompanionService({ id: 'my service' }), /מזהה השירות/)
  assert.throws(() => buildCompanionService({ id: 'a' }), /מזהה השירות/)
})

test('buildCompanionService פוסל גרסה מזערית שאינה מספרית', () => {
  assert.throws(
    () => buildCompanionService({ id: 'bridge', minVersion: 'v1.2-beta רביזיה' }),
    /גרסת השירות/
  )
})

test('buildCompanionService מקבל גרסה עם prerelease', () => {
  assert.equal(buildCompanionService({ id: 'bridge', minVersion: '1.2.0-beta.1' }).minVersion, '1.2.0-beta.1')
})

test('buildCompanionService פוסל גרסה עם נקודה כפולה או נקודה בסוף', () => {
  assert.throws(() => buildCompanionService({ id: 'bridge', minVersion: '1..2' }), /גרסת השירות/)
  assert.throws(() => buildCompanionService({ id: 'bridge', minVersion: '1.2.' }), /גרסת השירות/)
})

test('buildCompanionService פוסל גרסה ארוכה ממגבלת המודל (40 תווים)', () => {
  // 24 תווי ליבה + מקף + 20 תווי prerelease = 45: כל חלק תקין לבדו
  const tooLong = `${'1.'.repeat(11)}12-${'a'.repeat(20)}`
  assert.equal(tooLong.length, 45)
  assert.throws(() => buildCompanionService({ id: 'bridge', minVersion: tooLong }), /גרסת השירות/)
  const atLimit = `${'1.'.repeat(11)}12-${'a'.repeat(15)}`
  assert.equal(atLimit.length, 40)
  assert.equal(buildCompanionService({ id: 'bridge', minVersion: atLimit }).minVersion, atLimit)
})

test('serializeServiceForPublic מחזיר null כשאין מזהה', () => {
  assert.equal(serializeServiceForPublic(undefined), null)
  assert.equal(serializeServiceForPublic({ id: '', hideUnlessInstalled: true }), null)
})

test('serializeServiceForPublic מחזיר את ההצהרה המלאה', () => {
  assert.deepEqual(
    serializeServiceForPublic({ id: 'bridge', minVersion: '2.0', hideUnlessInstalled: true }),
    { id: 'bridge', minVersion: '2.0', hideUnlessInstalled: true }
  )
})

test('serviceFromDoc ממלא ברירות מחדל לתת-מסמך חסר', () => {
  assert.deepEqual(serviceFromDoc(undefined), { id: '', minVersion: '', hideUnlessInstalled: false })
})

test('parseInstalledServices: פרמטר חסר = אין סינון', () => {
  assert.deepEqual(parseInstalledServices(null), { services: null, invalid: false })
  assert.deepEqual(parseInstalledServices(undefined), { services: null, invalid: false })
})

test('parseInstalledServices: מחרוזת ריקה = "לא מותקן אצלי כלום"', () => {
  const { services, invalid } = parseInstalledServices('')
  assert.equal(invalid, false)
  assert.equal(services.size, 0)
})

test('parseInstalledServices מפרק מזהים עם ובלי גרסה', () => {
  const { services } = parseInstalledServices('bridge@1.2.0, Printer , scanner@2')
  assert.equal(services.get('bridge'), '1.2.0')
  assert.equal(services.get('printer'), '')
  assert.equal(services.get('scanner'), '2')
})

test('parseInstalledServices: כפילות — הגרסה הגבוהה גוברת', () => {
  const { services } = parseInstalledServices('bridge@1.0.0,bridge@1.4.0,bridge')
  assert.equal(services.get('bridge'), '1.4.0')
})

test('parseInstalledServices פוסל קלט לא-תקין', () => {
  assert.equal(parseInstalledServices('bridge@').invalid, true)
  assert.equal(parseInstalledServices('my service@1.0').invalid, true)
  assert.equal(parseInstalledServices('bridge@גרסה').invalid, true)
  const tooMany = Array.from({ length: MAX_INSTALLED_SERVICES + 1 }, (_, i) => `s${i}`).join(',')
  assert.equal(parseInstalledServices(tooMany).invalid, true)
})

const hidden = { service: { id: 'bridge', minVersion: '1.2.0', hideUnlessInstalled: true } }

test('isVisibleForInstalledServices: תוסף בלי הצהרה מוצג תמיד', () => {
  assert.equal(isVisibleForInstalledServices(null, new Map()), true)
  assert.equal(isVisibleForInstalledServices({ service: { id: 'bridge' } }, new Map()), true)
})

test('isVisibleForInstalledServices: צרכן שלא מסר רשימה רואה הכול', () => {
  assert.equal(isVisibleForInstalledServices(hidden, null), true)
})

test('isVisibleForInstalledServices: השירות חסר → מוסתר', () => {
  assert.equal(isVisibleForInstalledServices(hidden, new Map()), false)
})

test('isVisibleForInstalledServices: גרסה מותקנת מספקת → מוצג', () => {
  assert.equal(isVisibleForInstalledServices(hidden, new Map([['bridge', '1.2.0']])), true)
  assert.equal(isVisibleForInstalledServices(hidden, new Map([['bridge', '1.3']])), true)
})

test('isVisibleForInstalledServices: גרסה מותקנת נמוכה מדי → מוסתר', () => {
  assert.equal(isVisibleForInstalledServices(hidden, new Map([['bridge', '1.1.9']])), false)
})

test('isVisibleForInstalledServices: גרסה מזערית מוצהרת ללא גרסה מותקנת → מוסתר', () => {
  assert.equal(isVisibleForInstalledServices(hidden, new Map([['bridge', '']])), false)
})

test('isVisibleForInstalledServices: בלי גרסה מזערית די בהתקנה', () => {
  const anyVersion = { service: { id: 'bridge', minVersion: '', hideUnlessInstalled: true } }
  assert.equal(isVisibleForInstalledServices(anyVersion, new Map([['bridge', '']])), true)
})

test('filterByInstalledServices משאיר את התוספים הרגילים ומסיר את החסויים', () => {
  const plugins = [
    { id: 'a' },
    { id: 'b', companion: hidden },
    { id: 'c', companion: { service: { id: 'other', hideUnlessInstalled: true } } }
  ]
  assert.deepEqual(
    filterByInstalledServices(plugins, new Map([['bridge', '1.2.0']])).map((p) => p.id),
    ['a', 'b']
  )
  assert.deepEqual(filterByInstalledServices(plugins, null).map((p) => p.id), ['a', 'b', 'c'])
})
