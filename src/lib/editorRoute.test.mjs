import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPageEditorPath } from './editorRoute.js'

test('עורך העמוד מזוהה', () => {
  assert.equal(isPageEditorPath('/library/books/abc/12'), true)
  assert.equal(isPageEditorPath('/library/books/%D7%90/3/'), true)
  assert.equal(isPageEditorPath('/library/books/abc/12?x=1'), true)
})

test('עמודים אחרים בספרייה אינם העורך', () => {
  assert.equal(isPageEditorPath('/library'), false)
  assert.equal(isPageEditorPath('/library/books'), false)
  assert.equal(isPageEditorPath('/library/books/abc'), false)
  assert.equal(isPageEditorPath('/library/books/abc/example'), false)
  assert.equal(isPageEditorPath('/library/admin/books/x'), false)
  assert.equal(isPageEditorPath(undefined), false)
})
