import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAccessLost, isFatal } from './requestErrors.js'

const err = (status, extra = {}) => Object.assign(new Error('x'), { status, ...extra })

test('isAccessLost: התחברות שפגה, 401, 403', () => {
  assert.equal(isAccessLost(err(401, { sessionExpired: true })), true)
  assert.equal(isAccessLost(err(401)), true)
  assert.equal(isAccessLost(err(403)), true)
  assert.equal(isAccessLost(err(500)), false)
  assert.equal(isAccessLost(err(404)), false)
  assert.equal(isAccessLost(null), false)
})

test('isFatal: ההרשאה אבדה או תקלה בשרת (5xx)', () => {
  for (const status of [401, 403, 500, 502, 503, 0, 429]) assert.equal(isFatal(err(status)), true, String(status))
  assert.equal(isFatal(err(0, { sessionExpired: true })), true)
})

test('isFatal: כשל של פריט אחד או זמן — לא עוצר', () => {
  for (const status of [400, 404, 408, 409]) assert.equal(isFatal(err(status)), false, String(status))
  assert.equal(isFatal(new Error('x')), false)
  assert.equal(isFatal(undefined), false)
})

test('ריצה מרובה: נפילת רשת (0) או 429 עוצרות את כל הריצה', async () => {
  const { runLimited } = await import('../runLimited.js')
  for (const status of [0, 429]) {
    const result = await runLimited([1, 2, 3, 4], async (n) => { if (n === 2) throw err(status) }, { limit: 1, isFatal })
    assert.equal(result.fatal?.status, status)
    assert.deepEqual(result.notAttempted, [3, 4])
  }
})
