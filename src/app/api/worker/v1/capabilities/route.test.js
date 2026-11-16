// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest'
const { updateOne } = vi.hoisted(() => ({ updateOne: vi.fn().mockResolvedValue({}) }))
vi.mock('@/models/OcrWorkerState', () => ({ default: { updateOne } }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
import { POST } from './route'

const secret = 'S'.repeat(48)
const snapshot = { schemaVersion: 1, proofreading: { version: 1, lmCheck: true, alternatives: true,
  lexiconAvailable: true, contextAvailable: true, lexicons: [{ name: 'modern', version: 2 }], defaultLexicons: [] } }
const request = (body, token = secret) => new Request('http://localhost/api/worker/v1/capabilities', {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
})
beforeEach(() => {
  updateOne.mockClear()
  process.env.OCR_WORKER_SECRET = secret
  process.env.OCR_WORKER_ID = 'worker-1'
})

it('binds a sanitized snapshot to the authenticated worker, with server receipt time', async () => {
  const res = await POST(request({ ...snapshot, workerId: 'other-worker', localPath: 'private',
    proofreading: { ...snapshot.proofreading, path: 'private' } }))
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('no-store')
  const [filter, update] = updateOne.mock.calls.at(-1)
  expect(filter).toEqual({ workerId: 'worker-1' })
  expect(update.$set.proofreadingCapabilities).toEqual(snapshot.proofreading)
  expect(update.$set.capabilitiesReceivedAt).toBeInstanceOf(Date)
})

it('rejects unauthenticated, malformed and oversized reports before saving capabilities', async () => {
  expect((await POST(request(snapshot, 'wrong'))).status).toBe(401)
  expect(updateOne).not.toHaveBeenCalled()
  expect((await POST(request({ ...snapshot, proofreading: { ...snapshot.proofreading, lexicons: [{ name: '../x', version: 1 }] } }))).status).toBe(422)
  expect(updateOne.mock.calls.some(([, update]) => update.$set?.proofreadingCapabilities)).toBe(false)
  expect((await POST(request({ ...snapshot, filler: 'x'.repeat(20_000) }))).status).toBe(413)
})
