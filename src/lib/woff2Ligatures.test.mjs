import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { woff2LigatureNames } from './woff2Ligatures.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'icon-font.manifest.json'), 'utf8'))
const font = readFileSync(path.join(ROOT, 'public', manifest.file))

test('הליגטורות בגופן האייקונים המחויב כוללות את כל השמות שבמניפסט', () => {
  const ligatures = new Set(woff2LigatureNames(font))
  const missing = manifest.icons.filter((name) => !ligatures.has(name))
  assert.deepEqual(missing, [])
})

test('הרשימה ממוינת, בלי כפילויות, ורק שמות בצורת אייקון', () => {
  const ligatures = woff2LigatureNames(font)
  assert.deepEqual(ligatures, [...new Set(ligatures)].sort())
  for (const name of ligatures) assert.match(name, /^[a-z0-9_]+$/)
})

test('קובץ שאינו WOFF2 נדחה', () => {
  assert.throws(() => woff2LigatureNames(Buffer.from('not a font at all, definitely not')), /חתימה/)
})
