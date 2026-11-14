// @vitest-environment node
// GET /api/worker/v1/jobs/{id} — מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — מדולג.
// מכסה: 404 not_found (לא קיים, לא-hex, רישיות אחרת, של עובד אחר, לא נמסרה לעובד/preparing,
// gemini), state/closed/cancelRequested לכל סוג מצב, ack שמור, jobId זהה בדיוק למבוקש, no-store,
// ורשומה עם תאריכים פגומים (מדולגת ברשימה) שעונה כרגיל.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))

import mongoose from 'mongoose'
import OcrJob from '@/models/OcrJob'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { GET } from './route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const SECRET = 'S'.repeat(48)
const WORKER = 'worker-1'
const SHA_A = 'a'.repeat(64)

async function get(id, auth = `Bearer ${SECRET}`) {
  const res = await GET(
    new Request(`http://localhost/api/worker/v1/jobs/${id}`, { headers: auth ? { authorization: auth } : {} }),
    { params: Promise.resolve({ id }) }
  )
  return { res, body: await res.json() }
}

async function makeJob(over = {}) {
  const _id = new mongoose.Types.ObjectId()
  const doc = await OcrJob.create({
    _id,
    book: new mongoose.Types.ObjectId(),
    method: 'local',
    status: 'queued',
    active: true,
    workerId: WORKER,
    requestId: `req-${_id}`,
    inputPath: `${_id}/input-${SHA_A}.pdf`,
    inputSha256: SHA_A,
    inputBytes: 10,
    pageMap: [{ pdfPageIndex: 1, page: new mongoose.Types.ObjectId(), pageNumber: 1, expectedUpdatedAt: new Date(), imageSha256: SHA_A }],
    ...over,
  })
  return String(doc._id)
}

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  process.env.OCR_WORKER_SECRET = SECRET
  process.env.OCR_WORKER_ID = WORKER
})

describe('GET /api/worker/v1/jobs/{id}', () => {
  it('בלי Bearer → 401 JSON', async () => {
    const id = await makeJob()
    const { res, body } = await get(id, null)
    expect(res.status).toBe(401)
    expect(body).toEqual({ error: 'unauthorized' })
  })

  it('404 not_found: לא קיים, לא-hex, רישיות אחרת, עובד אחר, preparing, gemini', async () => {
    const mine = await makeJob()
    const otherWorker = await makeJob({ workerId: 'worker-2' })
    const preparing = await makeJob({ status: 'preparing', inputPath: undefined, inputSha256: undefined, inputBytes: undefined, pageMap: undefined })
    // נכשלה בהכנה — מעולם לא נמסרה לעובד
    const prepFailed = await makeJob({ status: 'failed', active: false, inputPath: undefined, inputSha256: undefined, inputBytes: undefined, pageMap: undefined })
    const gemini = await makeJob({ method: 'gemini', requestId: undefined, inputPath: undefined, inputSha256: undefined, pageMap: undefined, status: 'running' })
    for (const id of [new mongoose.Types.ObjectId().toString(), 'not-an-id', 'job-0001', mine.toUpperCase(), `${mine}0`, otherWorker, preparing, prepFailed, gemini]) {
      const { res, body } = await get(id)
      expect(res.status, id).toBe(404)
      expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(body).toEqual({ error: 'not_found' })
    }
  })

  it('queued / בעיבוד: state ו-closed:false, jobId זהה בדיוק, בלי ack', async () => {
    const q = await makeJob()
    const r1 = await get(q)
    expect(r1.res.status).toBe(200)
    expect(r1.res.headers.get('cache-control')).toBe('no-store')
    expect(r1.body).toEqual({ jobId: q, state: 'queued', cancelRequested: false, closed: false })
    for (const status of ['running', 'pausing', 'paused_runner', 'delivery_pending', 'needs_attention', 'applying']) {
      const id = await makeJob({ status })
      const { body } = await get(id)
      expect(body, status).toEqual({ jobId: id, state: 'in_progress', cancelRequested: false, closed: false })
    }
  })

  it('cancelled → state cancelled, closed:true, cancelRequested:true', async () => {
    const id = await makeJob({ status: 'cancelled', active: false, cancelRequested: true, decision: 'cancel', cancelReason: 'admin' })
    const { body } = await get(id)
    expect(body).toEqual({ jobId: id, state: 'cancelled', cancelRequested: true, closed: true })
  })

  it('completed / failed עם ack שמור → closed ו-ack בדיוק כפי שנשמר', async () => {
    const ackOf = (jobId, outcome, ack = 'accepted') => ({ ack, jobId, resultSha256: 'c'.repeat(64), outcome })
    const done = await makeJob({ status: 'completed', active: false })
    await OcrJob.updateOne({ _id: done }, { $set: { ack: ackOf(done, 'partial'), ackAt: new Date() } })
    const r = await get(done)
    expect(r.body).toEqual({ jobId: done, state: 'closed', cancelRequested: false, closed: true, ack: ackOf(done, 'partial') })

    const failed = await makeJob({ status: 'failed', active: false })
    await OcrJob.updateOne({ _id: failed }, { $set: { ack: ackOf(failed, 'failed') } })
    expect((await get(failed)).body.ack).toEqual(ackOf(failed, 'failed'))

    // ביטול אחרי שהגיעה תוצאה: ack=cancelled נשמר ומוחזר
    const cancelled = await makeJob({ status: 'cancelled', active: false, cancelRequested: true, decision: 'cancel' })
    await OcrJob.updateOne({ _id: cancelled }, { $set: { ack: ackOf(cancelled, 'cancelled', 'cancelled') } })
    expect((await get(cancelled)).body).toEqual({
      jobId: cancelled, state: 'cancelled', cancelRequested: true, closed: true, ack: ackOf(cancelled, 'cancelled', 'cancelled'),
    })

    // סגורה בלי ack (למשל אחרי ניקוי הקבצים) — אין שדה ack
    const noAck = await makeJob({ status: 'completed', active: false, inputPurgedAt: new Date() })
    expect(Object.hasOwn((await get(noAck)).body, 'ack')).toBe(false)
  })

  it('רשומה עם תאריכים פגומים (שמדולגת ברשימה) → 200 JSON רגיל, לא קריסה', async () => {
    const id = await makeJob({ status: 'running' })
    await OcrJob.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { createdAt: 'garbage', updatedAt: 'garbage' }, $unset: { 'pageMap.0.expectedUpdatedAt': '' } }
    )
    const { res, body } = await get(id)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(body).toEqual({ jobId: id, state: 'in_progress', cancelRequested: false, closed: false })
  })

  it('עבודה פעילה עם cancelRequested (לפני סגירה) מוצגת כך', async () => {
    const id = await makeJob({ status: 'running', cancelRequested: true })
    expect((await get(id)).body).toEqual({ jobId: id, state: 'in_progress', cancelRequested: true, closed: false })
  })
})
