import test from 'node:test'
import assert from 'node:assert/strict'
import { validOcrReviewState, ocrReviewRevision } from './ocrReviewState.js'

const base = () => ({ version: 1, revision: 'r1', words: ['א', 'ב', 'ג'], accepted: [0, 2] })

test('מצב תקין ומצב ריק של accepted מתקבלים', () => {
  assert.equal(validOcrReviewState(base()), true)
  assert.equal(validOcrReviewState({ ...base(), accepted: [] }), true)
})

test('null/undefined נדחים', () => {
  assert.equal(validOcrReviewState(null), false)
  assert.equal(validOcrReviewState(undefined), false)
})

test('גרסה שגויה נדחית', () => {
  assert.equal(validOcrReviewState({ ...base(), version: 2 }), false)
  assert.equal(validOcrReviewState({ ...base(), version: undefined }), false)
})

test('revision שאינו מחרוזת, או ארוך מ-2048, נדחה', () => {
  assert.equal(validOcrReviewState({ ...base(), revision: 5 }), false)
  assert.equal(validOcrReviewState({ ...base(), revision: null }), false)
  assert.equal(validOcrReviewState({ ...base(), revision: 'x'.repeat(2048) }), true)
  assert.equal(validOcrReviewState({ ...base(), revision: 'x'.repeat(2049) }), false)
})

test('words: טיפוס, כמות וסך תווים', () => {
  assert.equal(validOcrReviewState({ ...base(), words: 'אבג' }), false)
  assert.equal(validOcrReviewState({ ...base(), words: ['א', null, 'ג'] }), false)
  assert.equal(validOcrReviewState({ ...base(), words: new Array(50_001).fill('א'), accepted: [] }), false)
  assert.equal(validOcrReviewState({ ...base(), words: new Array(50_000).fill('א'), accepted: [] }), true)
  assert.equal(validOcrReviewState({ ...base(), words: ['א'.repeat(1_000_001), 'ב'.repeat(1_000_001)], accepted: [] }), false)
})

test('accepted: כפילויות, אינדקס חורג/שלילי/לא שלם, ארוך מ-words', () => {
  assert.equal(validOcrReviewState({ ...base(), accepted: [1, 1] }), false)
  assert.equal(validOcrReviewState({ ...base(), accepted: [3] }), false)
  assert.equal(validOcrReviewState({ ...base(), accepted: [-1] }), false)
  assert.equal(validOcrReviewState({ ...base(), accepted: [0.5] }), false)
  assert.equal(validOcrReviewState({ ...base(), accepted: ['0'] }), false)
  assert.equal(validOcrReviewState({ ...base(), accepted: [0, 1, 2, 3] }), false)
  assert.equal(validOcrReviewState({ ...base(), accepted: 'x' }), false)
})

const page = () => ({
  imagePath: '/img/1.jpg', lastOcrJobId: 'job1', lastOcrResultSha256: 'res', lastOcrAt: '2026-01-01T00:00:00.000Z', lastOcrTextSha256: 'txt',
})

test('ocrReviewRevision דטרמיניסטי ושדות חסרים שקולים לריקים', () => {
  assert.equal(ocrReviewRevision(page()), ocrReviewRevision(page()))
  assert.equal(ocrReviewRevision({}), ocrReviewRevision({ imagePath: '', lastOcrJobId: null }))
  assert.equal(ocrReviewRevision({ ...page(), lastOcrAt: new Date('2026-01-01T00:00:00.000Z') }), ocrReviewRevision(page()))
})

test('ocrReviewRevision משתנה עם כל אחד מהשדות', () => {
  const original = ocrReviewRevision(page())
  for (const [key, value] of [
    ['imagePath', '/img/2.jpg'], ['lastOcrJobId', 'job2'], ['lastOcrResultSha256', 'res2'],
    ['lastOcrAt', '2026-01-02T00:00:00.000Z'], ['lastOcrTextSha256', 'txt2'],
  ]) {
    assert.notEqual(ocrReviewRevision({ ...page(), [key]: value }), original, key)
  }
})
