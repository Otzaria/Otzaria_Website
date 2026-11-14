import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SEARCH_FEEDBACK_TABS, tabFromSearch, searchFeedbackTabItems, summaryText, modelLabel, countTables, keyStatusLabel, shortKeyId, keyActionUrl,
} from './searchFeedbackTerms.js'

describe('משוב חיפוש — לשוניות', () => {
  it('סיכום והתקנות; ?tab= מוכר בלבד', () => {
    assert.deepEqual(SEARCH_FEEDBACK_TABS.map((t) => t.label), ['סיכום', 'התקנות'])
    assert.equal(tabFromSearch('?tab=keys'), 'keys')
    assert.equal(tabFromSearch('?tab=nope'), null)
    assert.equal(tabFromSearch(''), null)
  })
  it('מונה ללשונית ההתקנות רק כשיש חסומות', () => {
    assert.equal(searchFeedbackTabItems({ keys: { blocked: 0 } })[1].count, undefined)
    const [, keys] = searchFeedbackTabItems({ keys: { blocked: 3 } })
    assert.equal(keys.count, 3)
    assert.equal(keys.countLabel, '3 התקנות חסומות')
    assert.equal(searchFeedbackTabItems({ keys: { blocked: 1 } })[1].countLabel, 'התקנה חסומה אחת')
    assert.equal(searchFeedbackTabItems(null)[1].count, undefined)
  })
})

describe('משוב חיפוש — סיכום וטבלאות', () => {
  it('שורת הסיכום', () => {
    assert.equal(summaryText(null), '')
    assert.equal(summaryText({ totalEvents: 12400, keys: { total: 85, blocked: 3 } }), '12,400 אירועים · 85 התקנות, מהן 3 חסומות')
    assert.equal(summaryText({ totalEvents: 1, keys: { total: 1, blocked: 1 } }), 'אירוע אחד · התקנה אחת, אחת מהן חסומה')
    assert.equal(summaryText({ totalEvents: 0, keys: { total: 0, blocked: 0 } }), '0 אירועים · 0 התקנות')
  })
  it('תווית מודל', () => {
    assert.equal(modelLabel({ modelFamilyId: '', modelQuantization: null }), 'לא ידוע')
    assert.equal(modelLabel({ modelFamilyId: 'e5', modelQuantization: 'q8' }), 'e5 (q8)')
    assert.equal(modelLabel({ modelFamilyId: 'e5', modelQuantization: null }), 'e5 (מלא)')
  })
  it('ארבע טבלאות, בשמות בעברית וכיוון לטיני לערכים טכניים', () => {
    const tables = countTables({
      byType: [{ type: 'vote', count: 2 }, { type: 'x', count: 1 }],
      byDay: [{ day: '2026-11-01', count: 5 }],
      byModel: [{ modelFamilyId: null, modelQuantization: null, count: 1 }],
      byAppVersion: [{ appVersion: '', count: 4 }],
    })
    assert.deepEqual(tables.map((t) => t.id), ['type', 'day', 'model', 'version'])
    assert.deepEqual(tables[0].rows[0], { key: 'vote', label: 'הצבעה', ltr: false, count: 2 })
    assert.equal(tables[0].rows[1].ltr, true)
    // היום — בפורמט של האתר ("1.11.2026"), לא ISO
    assert.equal(tables[1].rows[0].label, '1.11.2026')
    assert.equal(tables[1].rows[0].ltr, undefined)
    assert.equal(tables[2].rows[0].label, 'לא ידוע')
    assert.equal(tables[3].rows[0].label, 'לא ידוע')
    assert.deepEqual(countTables(null), [])
  })
})

describe('משוב חיפוש — התקנות', () => {
  it('מצב, מזהה מקוצר וכתובת הפעולה', () => {
    assert.equal(keyStatusLabel({ status: 'blocked' }), 'חסומה')
    assert.equal(keyStatusLabel({ status: 'active' }), 'פעילה')
    assert.equal(shortKeyId('abcdefghijklmnop'), 'abcdefghijkl…')
    assert.equal(shortKeyId('short'), 'short')
    assert.equal(keyActionUrl('a/b', 'block'), '/api/search-feedback/admin/keys/a%2Fb/block')
  })
})
