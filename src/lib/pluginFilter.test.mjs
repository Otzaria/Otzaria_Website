/**
 * בדיקות סינון מקומי של רשימת "כל התוספים" (src/app/plugins/all). הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterPlugins, extractSortedTags } from './pluginFilter.js'

function plugin(overrides = {}) {
  return {
    name: 'תוסף לדוגמה',
    shortDescription: 'תיאור קצר',
    description: 'תיאור מלא',
    status: 'stable',
    tags: [],
    ...overrides
  }
}

test('filterPlugins ללא סינון מחזיר את כל הרשימה כמו-שהיא', () => {
  const plugins = [plugin({ name: 'א' }), plugin({ name: 'ב' })]
  assert.deepEqual(filterPlugins(plugins), plugins)
  assert.deepEqual(filterPlugins(plugins, {}), plugins)
})

test('filterPlugins מסנן לפי חיפוש בשם, בתיאורים ובתגיות (case-insensitive)', () => {
  const plugins = [
    plugin({ name: 'ניקוד קולי' }),
    plugin({ name: 'אחר', shortDescription: 'תמיכה בניקוד' }),
    plugin({ name: 'אחר2', description: 'כולל ניקוד מלא' }),
    plugin({ name: 'אחר3', tags: ['Niqqud'] }),
    plugin({ name: 'לא רלוונטי' })
  ]
  const result = filterPlugins(plugins, { searchQuery: 'ניקוד' })
  assert.equal(result.length, 3)

  const byTag = filterPlugins(plugins, { searchQuery: 'niqqud' })
  assert.equal(byTag.length, 1)
  assert.equal(byTag[0].name, 'אחר3')
})

test('filterPlugins מסנן לפי סטטוס מדויק', () => {
  const plugins = [
    plugin({ name: 'א', status: 'stable' }),
    plugin({ name: 'ב', status: 'beta' }),
    plugin({ name: 'ג', status: 'experimental' })
  ]
  const result = filterPlugins(plugins, { statusFilter: 'beta' })
  assert.equal(result.length, 1)
  assert.equal(result[0].name, 'ב')
})

test('filterPlugins מסנן לפי תגית מדויקת (לא substring)', () => {
  const plugins = [
    plugin({ name: 'א', tags: ['לימוד'] }),
    plugin({ name: 'ב', tags: ['לימוד-מתקדם'] }),
    plugin({ name: 'ג', tags: [] })
  ]
  const result = filterPlugins(plugins, { activeTag: 'לימוד' })
  assert.equal(result.length, 1)
  assert.equal(result[0].name, 'א')
})

test('filterPlugins משלב את כל התנאים כ-AND', () => {
  const plugins = [
    plugin({ name: 'תוסף חיפוש', status: 'beta', tags: ['חיפוש'] }),
    plugin({ name: 'תוסף חיפוש', status: 'stable', tags: ['חיפוש'] }),
    plugin({ name: 'תוסף חיפוש', status: 'beta', tags: ['אחר'] })
  ]
  const result = filterPlugins(plugins, { searchQuery: 'חיפוש', statusFilter: 'beta', activeTag: 'חיפוש' })
  assert.equal(result.length, 1)
})

test('filterPlugins סובלני לתוסף בלי שדה tags', () => {
  const plugins = [plugin({ name: 'א', tags: undefined })]
  assert.deepEqual(filterPlugins(plugins, { searchQuery: 'א' }), plugins)
  assert.deepEqual(filterPlugins(plugins, { activeTag: 'all' }), plugins)
  assert.deepEqual(filterPlugins(plugins, { activeTag: 'משהו' }), [])
})

test('extractSortedTags מאחד תגיות כפולות וממיין א"ב עברי', () => {
  const plugins = [
    plugin({ tags: ['ב', 'א'] }),
    plugin({ tags: ['א', 'ג'] })
  ]
  assert.deepEqual(extractSortedTags(plugins), ['א', 'ב', 'ג'])
})

test('extractSortedTags מחזיר מערך ריק כשאין תגיות', () => {
  assert.deepEqual(extractSortedTags([plugin(), plugin()]), [])
})

test('filterPlugins לפי פלטפורמה: תוסף ללא הצהרה תמיד נכלל', () => {
  const everywhere = plugin({ name: 'כללי' })
  const desktop = plugin({ name: 'דסקטופ', platforms: ['windows', 'linux', 'macos'] })
  const mobile = plugin({ name: 'נייד', platforms: ['android', 'ios'] })
  const list = [everywhere, desktop, mobile]
  assert.deepEqual(filterPlugins(list, { platformFilter: 'android' }), [everywhere, mobile])
  assert.deepEqual(filterPlugins(list, { platformFilter: 'linux' }), [everywhere, desktop])
  assert.deepEqual(filterPlugins(list, { platformFilter: 'all' }), list)
  assert.deepEqual(filterPlugins(list), list)
})

test('filterPlugins: פלטפורמה מצטרפת (AND) לסטטוס', () => {
  const a = plugin({ name: 'א', status: 'beta', platforms: ['windows'] })
  const b = plugin({ name: 'ב', status: 'stable', platforms: ['windows'] })
  assert.deepEqual(filterPlugins([a, b], { platformFilter: 'windows', statusFilter: 'beta' }), [a])
})
