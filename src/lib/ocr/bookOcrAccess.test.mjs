import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ADMIN_BOOK_OCR, OWNER_BOOK_OCR, bookAllowed, ownsPersonalBook } from './bookOcrAccess.js'

const OWNER = '507f1f77bcf86cd799439099'

test('ownsPersonalBook: רק ספר שה-ownerId שלו הוא המשתמש (id או _id, מחרוזת או ObjectId/מאוכלס)', () => {
  assert.equal(ownsPersonalBook({ ownerId: OWNER }, { id: OWNER }), true)
  assert.equal(ownsPersonalBook({ ownerId: { _id: OWNER, name: 'x' } }, { _id: OWNER }), true)
  assert.equal(ownsPersonalBook({ ownerId: { toString: () => OWNER } }, { id: OWNER }), true)
  assert.equal(ownsPersonalBook({ ownerId: OWNER }, { id: 'other' }), false)
  // ספר ציבורי / ספר אישי שפורסם (ownerId הוסר) — לא של אף אחד
  assert.equal(ownsPersonalBook({ isPrivate: true }, { id: OWNER }), false)
  assert.equal(ownsPersonalBook({ ownerId: null }, { id: OWNER }), false)
  assert.equal(ownsPersonalBook({ ownerId: OWNER }, {}), false)
  assert.equal(ownsPersonalBook(null, { id: OWNER }), false)
})

test('שער הכניסה: ניהול — מנהלי ספרייה; בעלים — private_ocr (ומנהל כללי)', () => {
  assert.equal(ADMIN_BOOK_OCR.hasAccess({ role: 'admin_books_only' }), true)
  assert.equal(ADMIN_BOOK_OCR.hasAccess({ roles: ['private_ocr'] }), false)
  assert.equal(OWNER_BOOK_OCR.hasAccess({ roles: ['private_ocr'] }), true)
  assert.equal(OWNER_BOOK_OCR.hasAccess({ role: 'admin' }), true)
  assert.equal(OWNER_BOOK_OCR.hasAccess({ role: 'admin_books' }), false)
  assert.equal(OWNER_BOOK_OCR.hasAccess({ role: 'user' }), false)
})

test('bookAllowed: ניהול — כל ספר קיים; בעלים — רק ספר אישי שלו', () => {
  const user = { id: OWNER }
  assert.equal(bookAllowed(ADMIN_BOOK_OCR, { name: 'ציבורי' }, user), true)
  assert.equal(bookAllowed(ADMIN_BOOK_OCR, null, user), false)
  assert.equal(bookAllowed(OWNER_BOOK_OCR, { ownerId: OWNER }, user), true)
  assert.equal(bookAllowed(OWNER_BOOK_OCR, { name: 'ציבורי' }, user), false)
  assert.equal(bookAllowed(OWNER_BOOK_OCR, { ownerId: 'other' }, user), false)
  assert.equal(bookAllowed(OWNER_BOOK_OCR, null, user), false)
})
