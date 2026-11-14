import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSerialQueue } from './serialQueue.js'

const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('תור: משימה מתחילה רק אחרי שהקודמת הסתיימה, לפי סדר ההגעה', async () => {
  const q = createSerialQueue()
  const log = []
  const a = q.run(async () => { log.push('a:start'); await later(20); log.push('a:end'); return 'A' })
  const b = q.run(async () => { log.push('b:start'); await later(1); log.push('b:end'); return 'B' })
  assert.equal(q.idle(), false)
  assert.deepEqual(await Promise.all([a, b]), ['A', 'B'])
  assert.deepEqual(log, ['a:start', 'a:end', 'b:start', 'b:end'])
  assert.equal(q.idle(), true)
})

test('תור: המשימה נבנית ברגע שהיא רצה — רואה את מה שהקודמת שמרה', async () => {
  const q = createSerialQueue()
  let saved = { role: 'user' }
  const first = q.run(async () => { await later(10); saved = { ...saved, role: 'admin_books' } })
  const second = q.run(() => ({ ...saved, isSupervisor: true }))
  await first
  assert.deepEqual(await second, { role: 'admin_books', isSupervisor: true })
})

test('תור: כשל לא עוצר את הבאות, וההבטחה שלו נדחית', async () => {
  const q = createSerialQueue()
  const bad = q.run(async () => { throw new Error('x') })
  const good = q.run(() => 'ok')
  await assert.rejects(bad, /x/)
  assert.equal(await good, 'ok')
  assert.equal(q.idle(), true)
})
