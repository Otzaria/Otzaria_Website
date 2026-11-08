import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LRI, PDI, fileSizeText } from './fileSize.js'

/** הטקסט בלי תווי הבידוד — לבדיקת הנוסח */
const plain = (bytes) => fileSizeText(bytes).replace(/[\u2066\u2069]/g, '')

test('fileSizeText: בתים, KB שלם, MB ומעלה עם ספרה אחת בלי ".0"', () => {
  assert.equal(plain(0), '0 B')
  assert.equal(plain(512), '512 B')
  assert.equal(plain(48 * 1024), '48 KB')
  assert.equal(plain(48.4 * 1024), '48 KB')
  assert.equal(plain(1.5 * 1024 * 1024), '1.5 MB')
  assert.equal(plain(3 * 1024 * 1024), '3 MB')
  assert.equal(plain(320 * 1024 ** 2), '320 MB')
  assert.equal(plain(1.5 * 1024 ** 3), '1.5 GB')
})

test('fileSizeText: עיגול שמגיע ל-1024 עולה ליחידה הבאה', () => {
  assert.equal(plain(1024 * 1024 - 1), '1 MB')
  assert.equal(plain(1024 ** 3 - 1), '1 GB')
})

test('fileSizeText: עטוף בבידוד כיוון — לא מתהפך בתוך סוגריים בעברית', () => {
  assert.equal(fileSizeText(48 * 1024), `${LRI}48 KB${PDI}`)
  assert.equal(`הקובץ (${fileSizeText(2048)})`, `הקובץ (${LRI}2 KB${PDI})`)
})

test('fileSizeText: ערך חסר, לא מספר או שלילי — ריק', () => {
  for (const bad of [null, undefined, '', 'abc', NaN, -5, Infinity]) assert.equal(fileSizeText(bad), '')
  assert.equal(plain('2048'), '2 KB')
})
