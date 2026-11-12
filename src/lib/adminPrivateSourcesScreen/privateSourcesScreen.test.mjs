import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { OUTREACH_STATUSES_CONFIG_KEY } from '../institute-outreach.js'
import { MANUAL_SETS_CONFIG_KEY } from '../private-sources-sets.js'
import {
  PRIVATE_SOURCES_TABS, tabFromSearch, privateSourcesTabItems, SETTINGS_LISTS, settingsList, usageRows, usageCounts, settingsValues,
  manualSetsSummary, booksCount, usageText,
} from './privateSourcesTerms.js'

describe('מקורות פרטיים — לשוניות', () => {
  it('מקורות · פניות למכונים · הגדרות; ?tab= מוכר בלבד', () => {
    assert.deepEqual(PRIVATE_SOURCES_TABS.map((t) => t.label), ['מקורות', 'פניות למכונים', 'הגדרות'])
    assert.equal(tabFromSearch('?tab=settings'), 'settings')
    assert.equal(tabFromSearch('?tab=x'), null)
  })
  it('מונים: לא תועדו, אולי כפולות; אפס — בלי מונה', () => {
    const [s, o, g] = privateSourcesTabItems({ missing: 4 }, { duplicates: 1 })
    assert.equal(s.count, 4)
    assert.equal(s.countLabel, '4 ספרים שלא תועדו')
    assert.equal(o.countLabel, 'פנייה אחת שאולי כפולה')
    assert.equal(g.count, undefined)
    assert.equal(privateSourcesTabItems({ missing: 0 }, null)[0].count, undefined)
  })
})

describe('מקורות פרטיים — הגדרות', () => {
  it('חמש רשימות, ומפתחות ההגדרה כמו בשרת', () => {
    assert.deepEqual(SETTINGS_LISTS.map((l) => l.title), ['סטים', 'מצבי מקור', 'אופני אישור', 'פלטפורמות', 'מצבי פניות'])
    assert.deepEqual(SETTINGS_LISTS.map((l) => l.configKey), [
      MANUAL_SETS_CONFIG_KEY, 'private_source_statuses', 'private_source_permission_methods', 'private_source_platforms', OUTREACH_STATUSES_CONFIG_KEY,
    ])
    assert.equal(settingsList('nope'), null)
    for (const l of SETTINGS_LISTS.filter((x) => x.kind === 'statuses')) assert.ok(l.modal.title && l.modal.itemNoun && l.modal.usageNoun)
  })

  const sourceItems = [
    { record: { status: 'ok', permissionMethod: 'mail', allowedPlatforms: ['web', 'app'] } },
    { record: { status: 'ok', allowedPlatforms: ['web'] } },
    { record: null },
  ]
  const outreachItems = [{ status: 'open' }, { status: 'open' }, { status: 'done' }]

  it('השימוש בכל ערך — אותה גזירה כמו קודם', () => {
    assert.deepEqual(usageRows('statuses', { sourceItems }), [{ bookStatus: 'ok' }, { bookStatus: 'ok' }])
    assert.deepEqual(usageRows('methods', { sourceItems }), [{ bookStatus: 'mail' }])
    assert.deepEqual(usageRows('platforms', { sourceItems }).map((r) => r.bookStatus), ['web', 'app', 'web'])
    assert.equal(usageRows('outreachStatuses', { outreachItems }).length, 3)
    assert.deepEqual(usageRows('sets', { sourceItems }), [])
    assert.deepEqual(usageCounts('platforms', { sourceItems }), { web: 2, app: 1 })
  })

  it('ערכים לתצוגה וסטים', () => {
    const values = settingsValues('outreachStatuses', { open: { label: 'פתוחה', color: '#123' }, done: { label: 'הסתיימה' }, x: {} }, { outreachItems })
    assert.deepEqual(values, [
      { key: 'open', label: 'פתוחה', color: '#123', count: 2 },
      { key: 'done', label: 'הסתיימה', color: '', count: 1 },
      { key: 'x', label: 'x', color: '', count: 0 },
    ])
    assert.deepEqual(manualSetsSummary({ a: { label: 'סט א', bookPaths: ['1', '2'] }, b: {} }), [{ key: 'a', label: 'סט א', count: 2 }, { key: 'b', label: 'b', count: 0 }])
    assert.equal(booksCount(1), 'ספר אחד')
    assert.equal(usageText(0, 'ספרים'), 'לא בשימוש')
    assert.equal(usageText(1200, 'ספרים'), '1,200 ספרים')
  })
})
