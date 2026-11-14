// @vitest-environment node
// GET /api/worker/v1/jobs/{id}/input — מול MongoDB אמיתי וקבצים אמיתיים בתיקייה זמנית.
// מכסה: בייטים זהים ו-hash תואם inputSha256, Content-Type/Length/X-Content-SHA256/no-store;
// עבודה מבוטלת שקובצה קיים מוגשת; 404 not_found (עובד אחר / preparing / לא-hex);
// 404 input_unavailable (קובץ נמחק / נוקה); 409 input_corrupt (גודל שונה); 503 storage_unavailable.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import OcrJob from '@/models/OcrJob'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { writeJobFileDurable } from '@/lib/ocr/localStorage'
import { GET } from './route'

vi.setConfig({ testTimeout: 30000 })

let db
let tmp
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-worker-input-'))
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  delete process.env.OCR_LOCAL_STORAGE_DIR
  await fs.rm(tmp, { recursive: true, force: true })
})

const SECRET = 'S'.repeat(48)
const WORKER = 'worker-1'
const sha = (b) => createHash('sha256').update(b).digest('hex')

function get(id, auth = `Bearer ${SECRET}`) {
  return GET(
    new Request(`http://localhost/api/worker/v1/jobs/${id}/input`, { headers: auth ? { authorization: auth } : {} }),
    { params: Promise.resolve({ id }) }
  )
}

// עבודה עם קובץ קלט אמיתי באחסון הפרטי (כמו ש-buildJobInput כותב)
async function makeJob(bytes, over = {}) {
  const _id = new mongoose.Types.ObjectId()
  const w = await writeJobFileDurable(String(_id), 'input', bytes)
  await OcrJob.create({
    _id,
    book: new mongoose.Types.ObjectId(),
    method: 'local',
    status: 'queued',
    active: true,
    workerId: WORKER,
    requestId: `req-${_id}`,
    inputPath: w.relPath,
    inputSha256: w.sha256,
    inputBytes: w.bytes,
    pageMap: [{ pdfPageIndex: 1, page: new mongoose.Types.ObjectId(), pageNumber: 1, expectedUpdatedAt: new Date(), imageSha256: 'b'.repeat(64) }],
    ...over,
  })
  return { id: String(_id), abs: w.absPath, sha256: w.sha256 }
}

async function expectJsonError(res, status, error) {
  expect(res.status).toBe(status)
  expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(await res.json()).toEqual({ error })
}

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  process.env.OCR_WORKER_SECRET = SECRET
  process.env.OCR_WORKER_ID = WORKER
  process.env.OCR_LOCAL_STORAGE_DIR = path.join(tmp, 'storage')
})

describe('GET /api/worker/v1/jobs/{id}/input', () => {
  it('בייטים זהים, hash תואם inputSha256, כותרות נכונות', async () => {
    const bytes = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(600 * 1024 + 7)])
    const job = await makeJob(bytes)
    const res = await get(job.id)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-length')).toBe(String(bytes.length))
    expect(res.headers.get('x-content-sha256')).toBe(job.sha256)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const got = Buffer.from(await res.arrayBuffer())
    expect(got.length).toBe(bytes.length)
    expect(sha(got)).toBe(job.sha256)
  })

  it('עבודה מבוטלת שקובצה עוד קיים — מוגשת', async () => {
    const bytes = Buffer.from('%PDF-cancelled')
    const job = await makeJob(bytes, { status: 'cancelled', active: false, cancelRequested: true, decision: 'cancel' })
    const res = await get(job.id)
    expect(res.status).toBe(200)
    expect(sha(Buffer.from(await res.arrayBuffer()))).toBe(sha(bytes))
  })

  it('בלי Bearer → 401 JSON (לא PDF)', async () => {
    const job = await makeJob(Buffer.from('%PDF-x'))
    await expectJsonError(await get(job.id, null), 401, 'unauthorized')
  })

  it('404 not_found: עובד אחר, preparing, לא-hex, לא קיים', async () => {
    const other = await makeJob(Buffer.from('%PDF-other'), { workerId: 'worker-2' })
    const prep = await makeJob(Buffer.from('%PDF-prep'))
    // ההכנה עוד לא הסתיימה: הקובץ אולי כבר בדיסק, אבל הרשומה עוד לא מפנה אליו
    await OcrJob.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(prep.id) },
      { $set: { status: 'preparing' }, $unset: { inputPath: 1, inputSha256: 1, inputBytes: 1, pageMap: 1 } }
    )
    for (const id of [other.id, prep.id, 'abc', prep.id.toUpperCase(), new mongoose.Types.ObjectId().toString()]) {
      await expectJsonError(await get(id), 404, 'not_found')
    }
  })

  it('קובץ שנמחק → 404 input_unavailable; אחרי ניקוי (inputPurgedAt) → 404 input_unavailable', async () => {
    const gone = await makeJob(Buffer.from('%PDF-gone'))
    await fs.rm(gone.abs)
    await expectJsonError(await get(gone.id), 404, 'input_unavailable')

    const purged = await makeJob(Buffer.from('%PDF-purged'), { status: 'completed', active: false, inputPurgedAt: new Date() })
    await expectJsonError(await get(purged.id), 404, 'input_unavailable')
  })

  it('גודל הקובץ שונה מ-inputBytes → 409 input_corrupt (דחייה קבועה, לא PDF שגוי)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const job = await makeJob(Buffer.from('%PDF-corrupt'))
      await fs.appendFile(job.abs, 'garbage')
      await expectJsonError(await get(job.id), 409, 'input_corrupt')
      expect(spy.mock.calls.join(' ')).toContain('input_corrupt')
    } finally {
      spy.mockRestore()
    }
  })

  it('שורש האחסון חסר (כונן לא מחובר) → 503 storage_unavailable עם Retry-After', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const job = await makeJob(Buffer.from('%PDF-root'))
      process.env.OCR_LOCAL_STORAGE_DIR = path.join(tmp, 'not-mounted')
      const res = await get(job.id)
      expect(res.headers.get('retry-after')).toBe('300')
      await expectJsonError(res, 503, 'storage_unavailable')
    } finally {
      spy.mockRestore()
    }
  })
})
