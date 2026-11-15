/**
 * בדיקות היקף מוני-התג של פאנל הניהול (src/lib/adminBadgeScope.js). הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adminBadgeScope, hasAnyAdminBadge, EMPTY_ADMIN_BADGE_COUNTS } from './adminBadgeScope.js'

test('admin רואה את כל המונים', () => {
  assert.deepEqual(adminBadgeScope('admin'), { messages: true, uploads: true, plugins: true, pageReports: true })
})

test('admin_books: הודעות, העלאות ודיווחים על עמודים, בלי תוספים', () => {
  assert.deepEqual(adminBadgeScope('admin_books'), { messages: true, uploads: true, plugins: false, pageReports: true })
})

test('admin_plugins: הודעות ותוספים, בלי העלאות ודיווחים על עמודים', () => {
  assert.deepEqual(adminBadgeScope('admin_plugins'), { messages: true, uploads: false, plugins: true, pageReports: false })
})

test('admin_ocr, admin_books_only, developer ומשתמש רגיל — בלי מונים', () => {
  for (const role of ['admin_ocr', 'admin_books_only', 'developer', 'user', undefined]) {
    assert.deepEqual(adminBadgeScope(role), { messages: false, uploads: false, plugins: false, pageReports: false }, String(role))
    assert.equal(hasAnyAdminBadge(role), false, String(role))
  }
})

test('hasAnyAdminBadge חיובי לתפקידים עם מונה', () => {
  for (const role of ['admin', 'admin_books', 'admin_plugins']) {
    assert.equal(hasAnyAdminBadge(role), true, role)
  }
})

test('ערכי ברירת המחדל אפסיים וקפואים', () => {
  assert.deepEqual({ ...EMPTY_ADMIN_BADGE_COUNTS }, { unreadMessages: 0, pendingUploads: 0, pendingPlugins: 0, pendingPageReports: 0 })
  assert.ok(Object.isFrozen(EMPTY_ADMIN_BADGE_COUNTS))
})
