/**
 * בדיקות toPluginCardData — הקרנת תוסף ציבורי לשדות כרטיס התוסף. הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toPluginCardData, PLUGIN_CARD_FIELDS } from './pluginCardData.js'
import { filterPlugins } from './pluginFilter.js'

function publicPlugin(overrides = {}) {
  return {
    id: 'p1',
    pluginUid: 'uid-1',
    authorId: 'a1',
    name: 'תוסף',
    slug: 'plugin',
    shortDescription: 'תיאור קצר',
    description: 'תיאור מלא וארוך',
    version: '1.2.3',
    status: 'beta',
    author: 'מפתח',
    updatedAt: '2026-01-02',
    originalDate: '2026-01-01',
    fileUpdatedAt: '2026-01-03',
    compatibleWith: '0.9.89',
    maxAppVersion: null,
    requiresNetwork: false,
    tags: ['א', 'ב'],
    image: '/api/plugins/p1/image',
    screenshots: ['/api/plugins/p1/screenshots/0'],
    downloadUrl: '/api/plugins/p1/download',
    homepage: 'https://example.test',
    downloadCount: 7,
    ratingAvg: 4.5,
    ratingCount: 2,
    ratingVerifiedCount: 1,
    ratingBreakdown: [0, 0, 0, 1, 1],
    pluginFileSize: 1234,
    supportsDirectInstall: true,
    isPinned: false,
    versions: [{ version: '1.2.3', downloadUrl: '/x' }],
    ...overrides
  }
}

test('שומר בדיוק את שדות הכרטיס, בערכים זהים', () => {
  const source = publicPlugin()
  const card = toPluginCardData(source)
  assert.deepEqual(Object.keys(card).sort(), [...PLUGIN_CARD_FIELDS].sort())
  for (const field of PLUGIN_CARD_FIELDS) {
    assert.deepEqual(card[field], source[field], field)
  }
})

test('משמיט גרסאות, צילומי מסך, תיאור מלא ושדות פנימיים', () => {
  const card = toPluginCardData(publicPlugin())
  for (const field of ['versions', 'screenshots', 'description', 'pluginUid', 'authorId', 'ratingBreakdown', 'homepage']) {
    assert.equal(field in card, false, field)
  }
})

test('שדה חסר במקור אינו נוסף כ-undefined', () => {
  const card = toPluginCardData(publicPlugin({ fileUpdatedAt: undefined }))
  assert.equal('fileUpdatedAt' in card, false)
})

test('includeDescription שומר את התיאור המלא — החיפוש המקומי מוצא בו', () => {
  const plugins = [publicPlugin({ description: 'מילה נדירה בתיאור' })]
  const cards = plugins.map((p) => toPluginCardData(p, { includeDescription: true }))
  assert.equal(cards[0].description, 'מילה נדירה בתיאור')
  assert.deepEqual(
    filterPlugins(cards, { searchQuery: 'נדירה' }).map((p) => p.id),
    filterPlugins(plugins, { searchQuery: 'נדירה' }).map((p) => p.id)
  )
})
