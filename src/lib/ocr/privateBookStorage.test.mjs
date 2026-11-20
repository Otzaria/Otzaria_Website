import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { privateBookRoot, resolvePrivateBookPath } from './privateBookStorage.js'

test('סריקות פרטיות נשמרות מחוץ לתיקייה הציבורית', () => {
  assert.equal(privateBookRoot(), path.resolve('storage', 'private-books'))
  assert.equal(resolvePrivateBookPath('/private-books/11111111-1111-4111-8111-111111111111/page.2.jpg'), path.join(privateBookRoot(), '11111111-1111-4111-8111-111111111111', 'page.2.jpg'))
  for (const value of ['/private-books/../../secret', '/uploads/books/a/page.1.jpg', '/private-books/11111111-1111-4111-8111-111111111111/../../secret', '/private-books/11111111-1111-4111-8111-111111111111/source.pdf']) assert.throws(() => resolvePrivateBookPath(value))
})
