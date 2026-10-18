/** בדיקות prefersReducedMotion (src/lib/reducedMotion.js). הרצה: npm run test:node */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prefersReducedMotion } from './reducedMotion.js'

const fakeWindow = (matches) => {
  const queries = []
  return { queries, matchMedia: (query) => { queries.push(query); return { matches } } }
}

test('מחזיר את תשובת matchMedia לשאילתת reduced-motion', () => {
  const reduced = fakeWindow(true)
  assert.equal(prefersReducedMotion(false, reduced), true)
  assert.deepEqual(reduced.queries, ['(prefers-reduced-motion: reduce)'])
  assert.equal(prefersReducedMotion(true, fakeWindow(false)), false)
})

test('בלי window או בלי matchMedia — ה-fallback (ברירת מחדל false)', () => {
  assert.equal(prefersReducedMotion(), false) // node: אין window
  assert.equal(prefersReducedMotion(true), true)
  assert.equal(prefersReducedMotion(false, {}), false)
  assert.equal(prefersReducedMotion(true, {}), true)
})
