import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stateForUrlReplace } from './historyState.js'

test('מסיר את הסימונים של Next (__NA / _N) — אחרת Next מתעלם מ-replaceState ו-useSearchParams לא מתעדכן', () => {
  const state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ['tree'] }
  const out = stateForUrlReplace(state)
  assert.equal(out?.__NA, undefined)
  assert.deepEqual(out, { __PRIVATE_NEXTJS_INTERNALS_TREE: ['tree'] })
  assert.equal(stateForUrlReplace({ _N: true }), null)
})

test('שומר את שאר המפתחות (הסימון של ההגנה על שינויים שלא נשמרו), ולא משנה את המקור', () => {
  const state = { __NA: true, __unsavedGuard: true }
  assert.deepEqual(stateForUrlReplace(state), { __unsavedGuard: true })
  assert.deepEqual(state, { __NA: true, __unsavedGuard: true })
})

test('state ריק / לא אובייקט — null', () => {
  for (const value of [null, undefined, '', 0, 'x', [], {}]) assert.equal(stateForUrlReplace(value), null)
})
