import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  productLabel, typeLabel, triggerLabel, issueBadge, listQuery, pageInfo, reportsCountText, hasActiveFilters, formatBytes, unsavedAttachmentsText,
  reportFiles, systemText, contactErrorText, optionsOf, ISSUE_STATE_LABELS, EMPTY_FILTERS,
} from './appReportsTerms.js'
import { LRI, PDI } from '../adminList/fileSize.js'

describe('דיווחי תקלות — שמות', () => {
  it('מוצר (דיווח ישן בלי מוצר — אוצריא), סוג ומקור', () => {
    assert.equal(productLabel({}), 'אוצריא')
    assert.equal(productLabel({ product: 'offline-update' }), 'עדכוני אוצריא')
    assert.equal(typeLabel({ type: 'crash' }), 'קריסה')
    assert.equal(typeLabel({ type: 'x' }), 'x')
    assert.equal(triggerLabel({ trigger: 'crash_prompt', type: 'performance' }), 'אחרי תקיעה')
    assert.equal(triggerLabel({ trigger: 'crash_prompt', type: 'crash' }), 'אחרי קריסה')
    assert.equal(triggerLabel({ trigger: 'manual' }), 'נשלח בידי המשתמש')
    assert.equal(unsavedAttachmentsText(1), 'קובץ מצורף אחד לא נשמר באתר')
    assert.equal(unsavedAttachmentsText(3, true), '3 קבצים מצורפים נוספים לא נשמרו באתר')
    assert.equal(unsavedAttachmentsText(0), '')
    assert.deepEqual(optionsOf(ISSUE_STATE_LABELS).map((o) => o.value), ['open', 'closed', 'pending'])
  })
  it('הכרטיס ב-GitHub', () => {
    assert.equal(issueBadge({}), null)
    assert.deepEqual(issueBadge({ issuePending: true }), { state: 'pending', label: 'ממתין לפתיחה', tone: 'warning' })
    assert.equal(issueBadge({ issueNumber: 7, issueUrl: 'u' }).label, 'פתוח')
    assert.equal(issueBadge({ issueNumber: 7, issueState: 'closed', issueStateReason: 'duplicate' }).label, 'סגור (כפול)')
    assert.equal(issueBadge({ issueNumber: 7, issueState: 'closed' }).label, 'סגור')
    assert.equal(issueBadge({ issuePending: true, issueNumber: 3 }).state, 'open')
  })
})

describe('דיווחי תקלות — רשימה', () => {
  it('פרמטרי הבקשה כמו קודם: page, limit ואז המסננים שנבחרו', () => {
    assert.equal(listQuery(EMPTY_FILTERS, 1), 'page=1&limit=50')
    assert.equal(listQuery({ product: 'otzaria', type: '', trigger: 'manual', issueState: 'open' }, 3), 'page=3&limit=50&product=otzaria&trigger=manual&issueState=open')
  })
  it('עימוד', () => {
    assert.deepEqual(pageInfo(0, 1), { page: 1, pageCount: 1, from: 0, to: 0, total: 0 })
    assert.deepEqual(pageInfo(120, 2), { page: 2, pageCount: 3, from: 51, to: 100, total: 120 })
    assert.deepEqual(pageInfo(120, 9), { page: 3, pageCount: 3, from: 101, to: 120, total: 120 })
  })
  it('מונה וסינון פעיל', () => {
    assert.equal(reportsCountText(1), 'דיווח אחד')
    assert.equal(reportsCountText(1234), '1,234 דיווחים')
    assert.equal(hasActiveFilters(EMPTY_FILTERS), false)
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, type: 'bug' }), true)
  })
})

describe('דיווחי תקלות — עמוד הדיווח', () => {
  it('גדלים, קבצים ומערכת', () => {
    assert.equal(formatBytes(0), `${LRI}0 B${PDI}`)
    assert.equal(formatBytes(500), `${LRI}500 B${PDI}`)
    assert.equal(formatBytes(2048), `${LRI}2 KB${PDI}`)
    assert.equal(formatBytes(3 * 1024 * 1024), `${LRI}3 MB${PDI}`)
    assert.deepEqual(reportFiles({}), [])
    const files = reportFiles({ files: { diagnostics: { size: 10 }, minidump: { size: 5 } } })
    assert.deepEqual(files.map((f) => [f.kind, f.name]), [['diagnostics', 'diagnostics.json'], ['minidump', 'crash.dmp']])
    assert.equal(systemText({ platform: 'windows', arch: 'x64' }), 'windows · x64')
  })
  it('שגיאת שליחה למדווח', () => {
    assert.match(contactErrorText(429), /יותר מדי/)
    assert.equal(contactErrorText(500, 'שגיאה מהשרת'), 'שגיאה מהשרת')
    assert.match(contactErrorText(500), /לא הצלחנו/)
    assert.match(contactErrorText(401, 'Unauthorized'), /פג תוקף ההתחברות/)
    assert.match(contactErrorText(403, 'csrf_rejected'), /אין לך הרשאה/)
    assert.match(contactErrorText(500, 'Failed to contact reporter'), /לא הצלחנו/)
    assert.match(contactErrorText(503, 'shabbat'), /לא הצלחנו/)
  })
})
