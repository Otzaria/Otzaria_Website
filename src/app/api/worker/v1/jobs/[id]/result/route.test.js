// @vitest-environment node
// POST /api/worker/v1/jobs/{id}/result — מול MongoDB אמיתי (mongodb-memory-server) ותיקיית אחסון זמנית.
// בלי הבינארי — מדולג. מכסה את שכבת ה-HTTP: אימות, bad_hash_header, 413 לפי Content-Length,
// hash_mismatch, invalid_result, 422 עם details, 404 לעבודה לא מוכרת/של עובד אחר (בלי ליצור רשומה),
// accepted/already_received/cancelled עם בדיוק ארבעת שדות ה-ack, 409, 503 עם Retry-After — ובכל
// תשובה Content-Type JSON ו-no-store. הלוגיקה עצמה נבדקת ב-src/lib/ocr/localApply.int.test.mjs.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import OcrJob from '@/models/OcrJob'
import Page from '@/models/Page'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { cancelLocalJob } from '@/lib/ocr/localCancel'
import { isValidAck } from '@/lib/ocr/localApply.pure'
import { APPLY_LEASE_MS } from '@/lib/ocr/localApply'
import { POST, maxDuration } from './route'

vi.setConfig({ testTimeout: 30000 })

let db
let root
beforeAll(async () => {
  db = await startMongo()
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-result-route-'))
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  if (root) await fs.rm(root, { recursive: true, force: true })
})

const SECRET = 'S'.repeat(48)
const WORKER = 'worker-1'
const A = 'a'.repeat(64)
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function post(id, payload, { auth = `Bearer ${SECRET}`, sha, headers = {} } = {}) {
  const buf = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8')
  const h = { 'content-type': 'application/json; charset=utf-8', ...(auth ? { authorization: auth } : {}), ...headers }
  if (sha !== null) h['x-result-sha256'] = sha ?? sha256(buf)
  const res = await POST(
    new Request(`http://localhost/api/worker/v1/jobs/${id}/result`, { method: 'POST', headers: h, body: buf }),
    { params: Promise.resolve({ id }) }
  )
  expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(res.headers.get('cache-control')).toBe('no-store')
  return { res, body: await res.json(), sha: sha256(buf) }
}

async function makeJob(over = {}) {
  const _id = new mongoose.Types.ObjectId()
  const book = new mongoose.Types.ObjectId()
  const pages = await Promise.all(
    [1, 2].map((n) => Page.create({ book, pageNumber: n, imagePath: `/uploads/books/x/page.${n}.jpg` }))
  )
  await OcrJob.create({
    _id,
    book,
    method: 'local',
    status: 'delivery_pending',
    active: true,
    workerId: WORKER,
    requestId: `req-${_id}`,
    inputPath: `${_id}/input-${A}.pdf`,
    inputSha256: A,
    inputBytes: 10,
    totalPages: 2,
    pageMap: pages.map((p, i) => ({
      pdfPageIndex: i + 1,
      page: p._id,
      pageNumber: p.pageNumber,
      expectedUpdatedAt: p.updatedAt,
      imageSha256: A,
    })),
    ...over,
  })
  await fs.mkdir(path.join(root, String(_id)), { recursive: true })
  return String(_id)
}

const doc = (id, over = {}) => ({
  schemaVersion: 1,
  jobId: id,
  inputSha256: A,
  outcome: 'success',
  pipelineVersion: '0.1.0',
  pages: [
    { pdfPageIndex: 1, text: 'שלום', metadata: { confidence: 0.97 } },
    { pdfPageIndex: 2, text: 'עולם' },
  ],
  ...over,
})

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  process.env.OCR_WORKER_SECRET = SECRET
  process.env.OCR_WORKER_ID = WORKER
  process.env.OCR_LOCAL_STORAGE_DIR = root
})

describe('POST /api/worker/v1/jobs/{id}/result', () => {
  it('maxDuration 600', () => {
    expect(maxDuration).toBe(600)
  })

  it('בלי Bearer / סוד שגוי → 401 JSON, בלי שינוי', async () => {
    const id = await makeJob()
    for (const auth of [null, `Bearer ${'X'.repeat(48)}`]) {
      const { res, body } = await post(id, doc(id), { auth })
      expect(res.status).toBe(401)
      expect(body).toEqual({ error: 'unauthorized' })
    }
    expect((await OcrJob.findById(id).lean()).resultSha256).toBeUndefined()
  })

  it('accepted → already_received; ack בדיוק ארבעה שדות; העמודים נכתבו', async () => {
    const id = await makeJob()
    const first = await post(id, doc(id))
    expect(first.res.status).toBe(200)
    expect(first.body).toEqual({ ack: 'accepted', jobId: id, resultSha256: first.sha, outcome: 'success' })
    expect(Object.keys(first.body)).toEqual(['ack', 'jobId', 'resultSha256', 'outcome'])
    expect(isValidAck(first.body)).toBe(true)
    const again = await post(id, doc(id))
    expect(again.body).toEqual({ ack: 'already_received', jobId: id, resultSha256: first.sha, outcome: 'success' })
    const job = await OcrJob.findById(id).lean()
    expect(job).toMatchObject({ status: 'completed', active: false, successPages: 2 })
    const pages = await Page.find({ book: job.book }).sort({ pageNumber: 1 }).lean()
    expect(pages.map((p) => p.content)).toEqual(['שלום', 'עולם'])
  })

  it('X-Result-SHA256 באותיות גדולות מתקבל; ה-ack מחזיר אותיות קטנות', async () => {
    const id = await makeJob()
    const buf = Buffer.from(JSON.stringify(doc(id)))
    const { res, body } = await post(id, doc(id), { sha: sha256(buf).toUpperCase() })
    expect(res.status).toBe(200)
    expect(body.resultSha256).toBe(sha256(buf))
  })

  it('כותרת hash חסרה / לא תקינה → 400 bad_hash_header', async () => {
    const id = await makeJob()
    for (const sha of [null, 'abc', 'g'.repeat(64), A.slice(1), `${A}0`]) {
      const { res, body } = await post(id, doc(id), { sha })
      expect(res.status).toBe(400)
      expect(body).toEqual({ error: 'bad_hash_header' })
    }
  })

  it('Content-Length מעל 100MiB → 413 result_too_large', async () => {
    const id = await makeJob()
    const { res, body } = await post(id, doc(id), { headers: { 'content-length': String(100 * 1024 * 1024 + 1) } })
    expect(res.status).toBe(413)
    expect(body).toEqual({ error: 'result_too_large' })
  })

  it('גוף שלא תואם לכותרת → 400 hash_mismatch, בלי קובץ ובלי נעילה', async () => {
    const id = await makeJob()
    const { res, body } = await post(id, doc(id), { sha: 'f'.repeat(64) })
    expect(res.status).toBe(400)
    expect(body).toEqual({ error: 'hash_mismatch' })
    expect(await fs.readdir(path.join(root, id))).toEqual([])
    expect((await OcrJob.findById(id).lean()).resultSha256).toBeUndefined()
  })

  it('לא JSON / לא UTF-8 → 400 invalid_result', async () => {
    const id = await makeJob()
    for (const payload of ['not json', '[1]']) {
      const { res, body } = await post(id, payload)
      expect(res.status).toBe(400)
      expect(body).toEqual({ error: 'invalid_result' })
    }
  })

  it('הפרת חוזה → 422 validation_failed עם details (עד 5 שגיאות)', async () => {
    const id = await makeJob()
    const bad = doc(id, { jobId: 'other', inputSha256: 'b'.repeat(64), pages: [{ pdfPageIndex: 7, text: 'x' }] })
    const { res, body } = await post(id, bad)
    expect(res.status).toBe(422)
    expect(body.error).toBe('validation_failed')
    expect(body.details).toBe('jobId mismatch; inputSha256 mismatch; unrequested page 7; missing page 1; missing page 2')
    const job = await OcrJob.findById(id).lean()
    expect(job.resultSha256).toBeUndefined()
    expect(job.resultRejections).toHaveLength(1)
  })

  it('עבודה לא מוכרת / של עובד אחר / מזהה לא תקין → 404, ושום רשומה לא נוצרת', async () => {
    const unknown = new mongoose.Types.ObjectId().toString()
    const other = await makeJob({ workerId: 'worker-2' })
    for (const id of [unknown, other, 'not-an-id', unknown.toUpperCase()]) {
      const { res, body } = await post(id, doc(id))
      expect(res.status).toBe(404)
      expect(body).toEqual({ error: 'not_found' })
    }
    expect(await OcrJob.countDocuments({})).toBe(1)
    expect(await OcrJob.exists({ _id: unknown })).toBeNull()
  })

  it('hash אחר אחרי קליטה → 409 result_conflict', async () => {
    const id = await makeJob()
    await post(id, doc(id))
    const { res, body } = await post(id, doc(id, { pipelineVersion: '0.2.0' }))
    expect(res.status).toBe(409)
    expect(body).toEqual({ error: 'result_conflict' })
  })

  it('תוצאה אחרי ביטול מפורש → 200 ack=cancelled עם outcome=cancelled (גם בשליחה חוזרת)', async () => {
    const id = await makeJob()
    await cancelLocalJob(id, { reason: 'admin' })
    for (let i = 0; i < 2; i++) {
      const { res, body, sha } = await post(id, doc(id, { outcome: 'partial' }))
      expect(res.status).toBe(200)
      expect(body).toEqual({ ack: 'cancelled', jobId: id, resultSha256: sha, outcome: 'cancelled' })
    }
    const job = await OcrJob.findById(id).lean()
    const pages = await Page.find({ book: job.book }).lean()
    expect(pages.every((p) => p.content === '')).toBe(true)
  })

  // השירות 1.0.141+ (ResultFinalizer.cs:63-73): עמוד מעל 2,000,000 יחידות UTF-16 הופך לפני ההקפאה לעמוד בלי
  // text עם metadata ו-error.code=page_text_too_long, ו-success הופך ל-partial. metadata של הספר עשוי להכיל null.
  it('page_text_too_long מהשירות + עמוד בדיוק בגבול 2,000,000 → 200 accepted partial; העמוד החורג לא נכתב ונרשם עם הקוד', async () => {
    const id = await makeJob()
    const payload = doc(id, {
      outcome: 'partial',
      pages: [
        { pdfPageIndex: 1, text: 'א'.repeat(2_000_000), metadata: { lines: 30 } },
        {
          pdfPageIndex: 2,
          metadata: { lines: 41, review: null },
          error: { code: 'page_text_too_long', message: 'Page text exceeds 2000000 UTF-16 code units.' },
        },
      ],
      metadata: { gpu: { name: null, vram_peak_allocated_gb: null }, bridge_version: null },
    })
    const { res, body, sha } = await post(id, payload)
    expect(res.status).toBe(200)
    expect(body).toEqual({ ack: 'accepted', jobId: id, resultSha256: sha, outcome: 'partial' })
    expect(isValidAck(body)).toBe(true)
    const job = await OcrJob.findById(id).lean()
    expect(job).toMatchObject({ status: 'completed', successPages: 1, failedPages: 1 })
    expect(job.pageErrors).toHaveLength(1)
    expect(job.pageErrors[0].pageNumber).toBe(2)
    expect(job.pageErrors[0].message).toContain('(page_text_too_long)')
    const pages = await Page.find({ book: job.book }).sort({ pageNumber: 1 }).lean()
    expect(pages[0].content.length).toBe(2_000_000)
    expect(pages[1].content).toBe('')
  })

  it('partial שכל עמודיו page_text_too_long → ack partial כפי שנשלח; העבודה נסגרת כ-failed בלי לכתוב עמוד', async () => {
    const id = await makeJob()
    const tooLong = (i) => ({
      pdfPageIndex: i,
      error: { code: 'page_text_too_long', message: 'Page text exceeds 2000000 UTF-16 code units.' },
    })
    const { res, body, sha } = await post(id, doc(id, { outcome: 'partial', pages: [tooLong(1), tooLong(2)] }))
    expect(res.status).toBe(200)
    expect(body).toEqual({ ack: 'accepted', jobId: id, resultSha256: sha, outcome: 'partial' })
    const job = await OcrJob.findById(id).lean()
    expect(job).toMatchObject({ status: 'failed', errorCode: 'no_pages_succeeded', successPages: 0, failedPages: 2 })
    const pages = await Page.find({ book: job.book }).lean()
    expect(pages.every((p) => p.content === '')).toBe(true)
  })

  it('טקסט עמוד של 2,000,001 יחידות UTF-16 (קובץ שהוקפא לפני 1.0.141) → 422 "page 1 text too long", בלי נעילה', async () => {
    const id = await makeJob()
    const pages = [
      { pdfPageIndex: 1, text: '😀'.repeat(1_000_000) + 'x' },
      { pdfPageIndex: 2, text: 'עולם' },
    ]
    const { res, body } = await post(id, doc(id, { pages }))
    expect(res.status).toBe(422)
    expect(body).toEqual({ error: 'validation_failed', details: 'page 1 text too long' })
    expect((await OcrJob.findById(id).lean()).resultSha256).toBeUndefined()
  })

  it('החלה בעיצומה (lease חי) → 503 apply_in_progress עם Retry-After', async () => {
    const id = await makeJob()
    const payload = doc(id)
    const sha = sha256(Buffer.from(JSON.stringify(payload)))
    await OcrJob.updateOne(
      { _id: id },
      {
        $set: {
          resultSha256: sha,
          resultReceivedAt: new Date(),
          decision: 'apply',
          status: 'applying',
          applyLeaseUntil: new Date(Date.now() + APPLY_LEASE_MS),
        },
      }
    )
    const { res, body } = await post(id, payload)
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(body).toEqual({ error: 'apply_in_progress' })
  })
})
