import test from 'node:test'
import assert from 'node:assert/strict'
import { adminRouteDecision } from './adminRouteAccess.js'

const allowed = (subject, path) => adminRouteDecision(subject, path).action === 'allow'

test('תפקיד יחיד — כמו קודם: מנהל OCR רואה OCR ולא העלאות; מנהל ספרים להפך', () => {
  assert.equal(allowed('admin_ocr', '/library/admin/ocr-lines'), true)
  assert.equal(allowed('admin_ocr', '/api/admin/ocr-layout/x'), true)
  assert.equal(allowed('admin_ocr', '/library/admin/uploads'), false)
  assert.equal(allowed('admin_books', '/library/admin/uploads'), true)
  assert.equal(allowed('admin_books', '/library/admin/ocr-lines'), false)
  assert.equal(allowed('admin_books', '/api/admin/ocr-lines'), false)
})

test('כמה תפקידים — איחוד: מנהל ספרים + מנהל OCR מקבל את שניהם', () => {
  const both = ['admin_books', 'admin_ocr']
  for (const path of ['/library/admin', '/library/admin/uploads', '/library/admin/ocr-lines', '/api/admin/ocr-training', '/api/admin/uploads/list', '/library/admin/page-proof']) {
    assert.equal(allowed(both, path), true, path)
  }
  // מה ששניהם חוסמים — נשאר חסום
  for (const path of ['/library/admin/users', '/api/admin/users', '/library/admin/plugins', '/library/admin/search-feedback']) {
    assert.equal(allowed(both, path), false, path)
  }
})

test('JWT: roles קובע; JWT ישן (role בלבד) — כמו תפקיד יחיד', () => {
  assert.equal(allowed({ role: 'admin_books', roles: ['admin_books', 'admin_ocr'] }, '/library/admin/ocr-layout'), true)
  assert.equal(allowed({ role: 'admin_books' }, '/library/admin/ocr-layout'), false)
})

test('מפתח: לבדו — מופנה מהלוח; עם תפקיד ניהול — הלוח שלו', () => {
  assert.deepEqual(adminRouteDecision('developer', '/library/admin'), { action: 'redirect', to: '/library/admin/app-reports' })
  assert.equal(allowed('developer', '/library/admin/app-reports'), true)
  assert.equal(allowed('developer', '/api/admin/stats'), false)
  assert.equal(allowed(['developer', 'admin_ocr'], '/library/admin'), true)
  assert.equal(allowed(['developer', 'admin_ocr'], '/library/admin/app-reports'), true)
  assert.equal(allowed(['developer', 'admin_ocr'], '/library/admin/ocr-lines'), true)
})

test('בלי תפקיד ניהול — חסום', () => {
  for (const subject of [null, 'user', [], { role: 'user' }, 'nonsense']) {
    assert.equal(allowed(subject, '/library/admin'), false)
    assert.equal(allowed(subject, '/api/admin/stats'), false)
  }
})

test('מנהל כללי — הכול', () => {
  assert.equal(allowed('admin', '/library/admin/users'), true)
  assert.equal(allowed(['admin_ocr', 'admin'], '/api/admin/private-sources'), true)
})
