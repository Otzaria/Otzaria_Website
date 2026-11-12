import test from 'node:test'
import assert from 'node:assert/strict'
import { parseJsonResponse, describeNonJsonStatus } from './parseJsonResponse.mjs'

test('JSON תקין מוחזר כמות שהוא', async () => {
  const res = new Response(JSON.stringify({ success: true }), { status: 200 })
  assert.deepEqual(await parseJsonResponse(res), { success: true })
})

test('HTML של 413 הופך להודעה בעברית', async () => {
  const res = new Response('<html><h1>413</h1></html>', { status: 413 })
  const r = await parseJsonResponse(res)
  assert.equal(r.success, false)
  assert.equal(r.nonJson, true)
  assert.match(r.error, /גדול מדי/)
})

test('504 ו-5xx אחרים', () => {
  assert.match(describeNonJsonStatus(504), /פג הזמן/)
  assert.match(describeNonJsonStatus(500), /שגיאת שרת/)
  assert.match(describeNonJsonStatus(200), /מסנן/)
})
