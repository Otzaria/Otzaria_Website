import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runLimited } from './runLimited.js'

const tick = () => new Promise((r) => setTimeout(r, 1))

test('לא יותר מ-limit בקשות בו-זמנית, וכולן מסתיימות', async () => {
  let active = 0
  let peak = 0
  const progress = []
  const result = await runLimited([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], async () => {
    active++
    peak = Math.max(peak, active)
    await tick()
    active--
  }, { limit: 4, onProgress: (p) => progress.push(p.done) })
  assert.equal(peak, 4)
  assert.equal(result.done.length, 10)
  assert.deepEqual(result.failed, [])
  assert.equal(result.stopped, false)
  assert.deepEqual(progress.at(-1), 10)
})

test('כשל רגיל — ממשיכים; כשל קטלני — לא שולחים עוד', async () => {
  const seen = []
  const result = await runLimited([1, 2, 3, 4, 5, 6], async (n) => {
    seen.push(n)
    await tick()
    if (n === 1) throw new Error('רגיל')
    if (n === 2) throw Object.assign(new Error('פג'), { sessionExpired: true })
  }, { limit: 2, isFatal: (e) => e.sessionExpired })
  assert.equal(result.fatal.message, 'פג')
  assert.deepEqual(result.failed.map((f) => f.item).sort(), [1, 2])
  assert.ok(result.notAttempted.length > 0)
  assert.ok(!seen.includes(6))
})

test('עצירה: מה שיצא מסתיים, והשאר לא נשלח', async () => {
  let stop = false
  const result = await runLimited([1, 2, 3, 4, 5, 6, 7, 8], async (n) => {
    await tick()
    if (n === 2) stop = true
  }, { limit: 2, shouldStop: () => stop })
  assert.equal(result.stopped, true)
  assert.ok(result.done.length >= 2 && result.done.length < 8)
  assert.equal(result.done.length + result.notAttempted.length, 8)
})

test('רשימה ריקה — בלי בקשות', async () => {
  const result = await runLimited([], async () => { throw new Error('לא אמור לרוץ') })
  assert.deepEqual(result, { done: [], failed: [], fatal: null, stopped: false, notAttempted: [] })
})
