import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getRoles, hasRole, normalizeRoles, primaryRole, roleQuery, notRoleQuery,
  isAdmin, hasBooksAccess, hasBookLibraryAccess, hasOcrAccess, hasPluginsAccess, hasAppReportsAccess,
  hasSearchFeedbackAccess, hasTzuratAdminAccess, hasAnyAdminAccess,
  canEditLibraryDirectly, canHandleCorrections, canManageCorrections, canConfigureCorrections,
  ASSIGNABLE_ROLES,
} from './roles.js'

test('getRoles: מחרוזת, מערך, אובייקט (role + roles), ממוין לפי עדיפות ובלי כפילויות', () => {
  assert.deepEqual(getRoles('admin_ocr'), ['admin_ocr'])
  assert.deepEqual(getRoles(['admin_ocr', 'admin_books', 'admin_ocr']), ['admin_books', 'admin_ocr'])
  assert.deepEqual(getRoles({ role: 'admin_ocr', roles: ['admin_books'] }), ['admin_books', 'admin_ocr'])
  assert.deepEqual(getRoles({ role: 'admin_books', roles: ['admin_books', 'admin_ocr'] }), ['admin_books', 'admin_ocr'])
})

test('getRoles: משתמש רגיל / אורח / ערכים לא מוכרים — מערך ריק', () => {
  for (const subject of [null, undefined, '', 'user', [], ['user'], { role: 'user' }, { roles: ['nope'] }, {}]) {
    assert.deepEqual(getRoles(subject), [], JSON.stringify(subject))
  }
})

test('רשומה ישנה (role בלבד, בלי roles) — התפקיד שלה הוא role', () => {
  assert.deepEqual(getRoles({ role: 'admin_plugins' }), ['admin_plugins'])
  assert.deepEqual(getRoles({ role: 'admin_plugins', roles: null }), ['admin_plugins'])
})

test('normalizeRoles: מסנן, ממיין, ומנהל כללי נשמר לבדו', () => {
  assert.deepEqual(normalizeRoles(['admin_ocr', 'admin_books']), ['admin_books', 'admin_ocr'])
  assert.deepEqual(normalizeRoles(['admin_ocr', 'admin', 'developer']), ['admin'])
  assert.deepEqual(normalizeRoles(['user', 'bogus']), [])
  assert.deepEqual(normalizeRoles('admin_ocr'), ['admin_ocr'])
  assert.deepEqual(normalizeRoles(undefined), [])
  assert.deepEqual(normalizeRoles({ role: 'admin' }), [])
})

test('primaryRole: בעל העדיפות הגבוהה, או user', () => {
  assert.equal(primaryRole(['admin_ocr', 'admin_books']), 'admin_books')
  assert.equal(primaryRole(['developer', 'admin_ocr']), 'admin_ocr')
  assert.equal(primaryRole([]), 'user')
  assert.equal(primaryRole({ role: 'user', roles: [] }), 'user')
  // מנהל כללי תמיד ראשי — שאילתות ישנות לפי role: 'admin' ממשיכות למצוא אותו
  assert.equal(primaryRole(ASSIGNABLE_ROLES), 'admin')
})

test('שאילתות Mongo בודקות גם roles וגם role', () => {
  assert.deepEqual(roleQuery(['admin_ocr']), { $or: [{ role: { $in: ['admin_ocr'] } }, { roles: { $in: ['admin_ocr'] } }] })
  assert.deepEqual(notRoleQuery(['admin']), { role: { $nin: ['admin'] }, roles: { $nin: ['admin'] } })
})

test('הרשאות — מנהל ספרים + מנהל OCR מקבל את האיחוד, ולא יותר', () => {
  const u = { role: 'admin_books', roles: ['admin_books', 'admin_ocr'] }
  assert.equal(hasBooksAccess(u), true)
  assert.equal(hasBookLibraryAccess(u), true)
  assert.equal(hasTzuratAdminAccess(u), true)
  assert.equal(hasOcrAccess(u), true)
  assert.equal(hasAnyAdminAccess(u), true)
  assert.equal(isAdmin(u), false)
  assert.equal(hasPluginsAccess(u), false)
  assert.equal(hasSearchFeedbackAccess(u), false)
  assert.equal(hasAppReportsAccess(u), false)
})

test('הרשאות — כל צורה של נושא נותנת אותה תשובה', () => {
  for (const subject of ['admin_ocr', ['admin_ocr'], { role: 'admin_ocr' }, { role: 'user', roles: ['admin_ocr'] }]) {
    assert.equal(hasOcrAccess(subject), true)
    assert.equal(hasBooksAccess(subject), false)
  }
})

test('הרשאות לפי משתמש (דגלים + תפקידים)', () => {
  const ocrAndBooks = { roles: ['admin_ocr', 'admin_books'] }
  assert.equal(canEditLibraryDirectly(ocrAndBooks), true)
  assert.equal(canHandleCorrections(ocrAndBooks), true)
  assert.equal(canManageCorrections(ocrAndBooks), true)
  assert.equal(canConfigureCorrections(ocrAndBooks), false)
  assert.equal(canConfigureCorrections({ roles: ['admin'] }), true)
  assert.equal(canEditLibraryDirectly({ roles: ['admin_ocr'] }), false)
  assert.equal(canEditLibraryDirectly({ roles: ['admin_ocr'], isSupervisor: true }), true)
  assert.equal(canHandleCorrections(null), false)
})

test('hasRole', () => {
  assert.equal(hasRole(['developer', 'admin_ocr'], 'developer'), true)
  assert.equal(hasRole('admin_ocr', 'developer'), false)
})
