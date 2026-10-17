/**
 * בדיקות ללוגיקה של אזור החשבון בכותרות (src/lib/accountMenu.js). הרצה: npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accountButtonLabel,
  accountButtonTitle,
  accountMenuLinks,
  adminHref,
  loginHref,
  unreadMessagesLabel,
  userInitial
} from './accountMenu.js'

test('loginHref: callbackUrl מקודד, ובלעדיו — דף ההתחברות בלבד', () => {
  assert.equal(loginHref('/plugins/a b'), '/auth/login?callbackUrl=%2Fplugins%2Fa%20b')
  assert.equal(loginHref(), '/auth/login')
})

test('adminHref: מפתח לדיווחי התוכנה, כל סוגי המנהלים ללוח הניהול, משתמש רגיל — אין', () => {
  assert.equal(adminHref('developer'), '/library/admin/app-reports')
  for (const role of ['admin', 'admin_plugins', 'admin_books', 'admin_books_only', 'admin_ocr', 'model_trainer']) {
    assert.equal(adminHref(role), '/library/admin', role)
  }
  assert.equal(adminHref('user'), null)
  assert.equal(adminHref(undefined), null)
})

test('userInitial: אות ראשונה (גדולה באנגלית); בלי שם — null (אייקון במקומה)', () => {
  assert.equal(userInitial('  ישראל ישראלי '), 'י')
  assert.equal(userInitial('dan'), 'D')
  assert.equal(userInitial(''), null)
})

test('accountButtonTitle: שם ואימייל בשתי שורות; בלי שם — "החשבון שלי"', () => {
  assert.equal(accountButtonTitle('ישראל ישראלי', 'a@b.co'), 'ישראל ישראלי\na@b.co')
  assert.equal(accountButtonTitle(' דן ', ''), 'דן')
  assert.equal(accountButtonTitle(null, 'a@b.co'), 'החשבון שלי\na@b.co')
})

test('accountButtonLabel: השם המלא, ומונה ההודעות כשיש', () => {
  assert.equal(accountButtonLabel('ישראל ישראלי'), 'החשבון של ישראל ישראלי')
  assert.equal(accountButtonLabel(''), 'החשבון שלי')
  assert.equal(accountButtonLabel('דן', 1), 'החשבון של דן, הודעה חדשה אחת')
  assert.equal(unreadMessagesLabel(4), ', 4 הודעות חדשות')
})

test('accountMenuLinks: האזור האישי לכולם; ניהול רק למורשים, עם מונה', () => {
  assert.deepEqual(accountMenuLinks('user').map(l => l.href), ['/library/dashboard'])
  assert.equal(accountMenuLinks('user')[0].label, 'האזור האישי')
  const admin = accountMenuLinks('admin', 3)
  assert.deepEqual(admin.map(l => l.href), ['/library/dashboard', '/library/admin'])
  assert.equal(admin[1].badge, 3)
  assert.equal(accountMenuLinks('admin', 0)[1].badge, undefined)
  assert.equal(accountMenuLinks('developer')[1].href, '/library/admin/app-reports')
})
