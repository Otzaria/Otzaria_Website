import test from 'node:test'
import assert from 'node:assert/strict'
import { canReadBook, canRunPrivateOcr, canUseBookEditor, PUBLIC_BOOK_FILTER } from './privateBooks.js'
import { ASSIGNABLE_ROLES, normalizeRoles, hasPrivateOcrAccess, hasAnyAdminAccess, hasBookLibraryAccess, hasBooksAccess, hasOcrAccess, hasPluginsAccess, hasSearchFeedbackAccess } from './roles.js'
import { adminRouteDecision } from './adminRouteAccess.js'

const owner = { id: 'owner', roles: ['private_ocr'] }
const book = { isPrivate: true, privateOcr: true, ownerId: 'owner', isHidden: true }

test('תפקיד מפורש בלבד, ללא שום הרשאת ניהול', () => {
  assert.ok(ASSIGNABLE_ROLES.includes('private_ocr'))
  assert.deepEqual(normalizeRoles(['user', 'private_ocr']), ['private_ocr'])
  assert.equal(hasPrivateOcrAccess(owner), true)
  for (const fn of [hasAnyAdminAccess, hasBookLibraryAccess, hasBooksAccess, hasOcrAccess, hasPluginsAccess, hasSearchFeedbackAccess]) assert.equal(fn(owner), false)
  for (const user of [null, {}, { role: 'user' }, { role: 'admin_ocr' }, { role: 'admin_books' }]) assert.equal(hasPrivateOcrAccess(user), false)
})

test('רק בעלים עם הרשאה או מנהל כללי יכולים לעבד ספר פרטי', () => {
  assert.equal(canRunPrivateOcr(book, owner), true)
  assert.equal(canRunPrivateOcr(book, { _id: 'owner', role: 'private_ocr' }), true)
  assert.equal(canRunPrivateOcr(book, { id: 'other', role: 'private_ocr' }), false)
  assert.equal(canRunPrivateOcr(book, { id: 'owner', role: 'user' }), false)
  assert.equal(canRunPrivateOcr({ ...book, isPrivate: false }, owner), false)
  assert.equal(canRunPrivateOcr({ ...book, privateOcr: undefined }, owner), false)
  assert.equal(canRunPrivateOcr(book, { role: 'admin' }), true)
  assert.equal(canRunPrivateOcr(null, owner), false)
})

test('אין עריכת ספר OCR פרטי; מנהלי ספרייה ממשיכים לקבל גישה', () => {
  assert.equal(canReadBook(book, owner), true)
  assert.equal(canUseBookEditor(book, owner), false)
  assert.equal(canReadBook(book, { id: 'other', role: 'private_ocr' }), false)
  assert.equal(canReadBook({ ...book, privateOcr: undefined }, { id: 'owner', role: 'user' }), true)
  assert.equal(canUseBookEditor({ ...book, privateOcr: undefined }, owner), true)
  for (const role of ['admin', 'admin_books', 'admin_books_only']) assert.equal(canUseBookEditor(book, { role }), true)
  assert.equal(canReadBook({ name: 'ספר ישן' }, null), true)
  assert.deepEqual(PUBLIC_BOOK_FILTER, { isPrivate: { $ne: true }, ownerId: null })
})

test('התפקיד אינו פותח שום מסלול ניהול, גם לא מיזוג, מחיקה או הוראות', () => {
  for (const path of ['/api/admin/books/merge', '/api/admin/books/delete', '/api/admin/books/global-instructions', '/api/admin/books/ocr/start', '/api/admin/books/ocr/conflicts', '/api/admin/users', '/api/admin/store-settings']) {
    assert.equal(adminRouteDecision(owner, path).action, 'deny', path)
    assert.equal(adminRouteDecision({ role: 'admin' }, path).action, 'allow', path)
  }
})
