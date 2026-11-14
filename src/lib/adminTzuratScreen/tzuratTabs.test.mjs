// לשוניות "צורת הדף": שמות, הלשונית מהכתובת, המונים ועדכונם המקומי (tzuratTabs.js).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TZURAT_TABS, statsAfterChange, tabFromLocation, tabCounts, tzuratTabItems } from './tzuratTabs.js'

describe('לשוניות צורת הדף', () => {
  it('שמונה לשוניות בשמות לפי המילון, והמזהים כמו קודם', () => {
    assert.deepEqual(TZURAT_TABS.map((t) => t.label), ['מצב', 'חבילות', 'מחלוקות', 'הגשות', 'דיווחים', 'הורדות', 'הנחיות', 'מפתחות גישה'])
    assert.deepEqual(TZURAT_TABS.map((t) => t.id), ['overview', 'uploads', 'disputes', 'submissions', 'reports', 'export', 'guide', 'tokens'])
  })
  it('בטלפון בשורה רק מצב ושלושת התורים; השאר ב-⋮', () => {
    assert.deepEqual(TZURAT_TABS.filter((t) => !t.hideOnPhone).map((t) => t.id), ['overview', 'disputes', 'submissions', 'reports'])
  })
  it('הלשונית מהכתובת: ?tab= קודם, אחר כך # (הקישורים מלוח הניהול), ולא מוכרת — null', () => {
    assert.equal(tabFromLocation({ search: '?tab=reports', hash: '#disputes' }), 'reports')
    assert.equal(tabFromLocation({ hash: '#disputes' }), 'disputes')
    assert.equal(tabFromLocation({ search: '?tab=nope', hash: '#tokens' }), 'tokens')
    assert.equal(tabFromLocation({ hash: '#nope' }), null)
    assert.equal(tabFromLocation(), null)
  })
  it('מונים מ-stats: במחלוקת, ממתינות, דיווחים חדשים; בלי stats — null', () => {
    const stats = { items: { byStatus: { disputed: 30 } }, submissions: { byStatus: { submitted: 1 } }, reports: { byStatus: {} } }
    assert.deepEqual(tabCounts(stats), { disputes: 30, submissions: 1, reports: 0 })
    assert.equal(tabCounts(null), null)
    const items = tzuratTabItems(stats)
    assert.equal(items.find((t) => t.id === 'disputes').count, 30)
    assert.equal(items.find((t) => t.id === 'disputes').countLabel, '30 מחלוקות')
    assert.equal(items.find((t) => t.id === 'submissions').countLabel, 'הגשה אחת ממתינה לאישור')
    assert.equal(items.find((t) => t.id === 'reports').count, undefined)
    // בטעינה — מקום שמור למונה (null) רק בלשוניות שיש להן מונה
    assert.equal(tzuratTabItems(null).some((t) => 'count' in t), false)
    assert.deepEqual(tzuratTabItems(null, { pending: true }).filter((t) => 'count' in t).map((t) => [t.id, t.count]), [['disputes', null], ['submissions', null], ['reports', null]])
  })
})

describe('עדכון מקומי של המונים', () => {
  const stats = { items: { byStatus: { disputed: 2, resolved: 5 } }, submissions: { byStatus: { submitted: 1 } }, reports: { byStatus: { new: 0 } }, volunteers: { total: 3 } }
  it('הכרעה: במחלוקת פחות 1, הוכרע ועוד 1; השאר לא משתנה', () => {
    const next = statsAfterChange(stats, 'item', 'disputed', 'resolved')
    assert.deepEqual(next.items.byStatus, { disputed: 1, resolved: 6 })
    assert.equal(next.submissions, stats.submissions)
    assert.equal(next.volunteers, stats.volunteers)
    assert.deepEqual(tabCounts(next), { disputes: 1, submissions: 1, reports: 0 })
    assert.equal(stats.items.byStatus.disputed, 2)
  })
  it('אישור הגשה ומצב דיווח; לא יורד מתחת ל-0', () => {
    assert.deepEqual(statsAfterChange(stats, 'submission', 'submitted', 'approved').submissions.byStatus, { submitted: 0, approved: 1 })
    assert.deepEqual(statsAfterChange(stats, 'report', 'new', 'fixed').reports.byStatus, { new: 0, fixed: 1 })
  })
  it('בלי stats, סוג לא מוכר או בלי שינוי — אותו אובייקט', () => {
    assert.equal(statsAfterChange(null, 'item', 'disputed', 'resolved'), null)
    assert.equal(statsAfterChange(stats, 'batch', 'active', 'paused'), stats)
    assert.equal(statsAfterChange(stats, 'item', 'disputed', 'disputed'), stats)
  })
})
