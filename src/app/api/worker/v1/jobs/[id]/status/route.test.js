// @vitest-environment node
// POST /api/worker/v1/jobs/{id}/status — מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — מדולג.
// מכסה: אימות, דוגמת החוזה → {"cancelRequested":false} ועדכון השדות, reportSeq עולה בלבד (ישן/כפול
// לא דורס, גם במקביל), מעברי מצב, needs_attention והודעה, דיווח completed לא סוגר, עבודה סגורה/מבוטלת
// לא נפתחת (ומחזירה cancelRequested נכון), applying לא משתנה, startedAt פעם אחת, ולידציה (400/413/
// 422), wrong_worker 403, 404 לעבודה שאינה של העובד, ו-staleJobs שלא נוגע בעבודת local.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))

import mongoose from 'mongoose'
import OcrJob from '@/models/OcrJob'
import OcrWorkerState from '@/models/OcrWorkerState'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { reapStaleOcrJobs } from '@/lib/ocr/staleJobs'
import { POST } from './route'

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

// contracts/examples/status-report*.json (workerId תואם לתצורת הטסט)
const EXAMPLE = { workerId: 'worker-1', state: 'running', progress: { phase: 'recognize', pagesDone: 1, pagesTotal: 2 }, reportSeq: 7, attempt: 1, message: 'recognizing' }
const ATTENTION = { workerId: 'worker-1', state: 'needs_attention', progress: { phase: 'needs_attention', pagesDone: 0, pagesTotal: 2 }, reportSeq: 9, attempt: 1, message: 'device_missing: the required AMD GPU is not available to the worker' }

const report = (over = {}) => ({ ...EXAMPLE, ...over })

async function post(id, body, { auth = `Bearer ${SECRET}`, raw = false, headers = {} } = {}) {
  const res = await POST(
    new Request(`http://localhost/api/worker/v1/jobs/${id}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}), ...headers },
      body: raw ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )
  return { res, body: await res.json() }
}

async function makeJob(over = {}) {
  const _id = new mongoose.Types.ObjectId()
  await OcrJob.create({
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
    totalPages: 2,
    pageMap: [
      { pdfPageIndex: 1, page: new mongoose.Types.ObjectId(), pageNumber: 1, expectedUpdatedAt: new Date(), imageSha256: SHA_A },
      { pdfPageIndex: 2, page: new mongoose.Types.ObjectId(), pageNumber: 2, expectedUpdatedAt: new Date(), imageSha256: SHA_A },
    ],
    ...over,
  })
  return String(_id)
}

const load = (id) => OcrJob.findById(id).lean()

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  process.env.OCR_WORKER_SECRET = SECRET
  process.env.OCR_WORKER_ID = WORKER
})

describe('POST /api/worker/v1/jobs/{id}/status', () => {
  it('בלי Bearer / סוד שגוי → 401 JSON, בלי שינוי', async () => {
    const id = await makeJob()
    for (const auth of [null, `Bearer ${'X'.repeat(48)}`]) {
      const { res, body } = await post(id, EXAMPLE, { auth })
      expect(res.status).toBe(401)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(body).toEqual({ error: 'unauthorized' })
    }
    expect((await load(id)).reportSeq).toBe(0)
  })

  it('דוגמת החוזה → 200 {"cancelRequested":false}; השדות, הסטטוס, startedAt ו-lastSeenAt מתעדכנים', async () => {
    const id = await makeJob()
    const before = Date.now()
    const { res, body } = await post(id, EXAMPLE)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({ cancelRequested: false })
    const j = await load(id)
    expect(j).toMatchObject({
      status: 'running',
      active: true,
      reportSeq: 7,
      workerState: 'running',
      attempt: 1,
      progressPhase: 'recognize',
      processedPages: 1,
      progressPagesTotal: 2,
      workerMessage: 'recognizing',
      decision: null,
    })
    expect(j.startedAt.getTime()).toBeGreaterThanOrEqual(before - 5)
    expect(j.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before - 5)
    const st = await OcrWorkerState.findOne({ workerId: WORKER }).lean()
    expect(st.lastRoute).toBe(`POST /api/worker/v1/jobs/${id}/status`)
  })

  it('reportSeq 7 ואחריו 5 (ישן) ושוב 7 (כפול): נשמר 7, בלי דריסה; התשובה עדיין 200', async () => {
    const id = await makeJob()
    await post(id, EXAMPLE)
    const old = await post(id, report({ reportSeq: 5, state: 'paused_runner', progress: { phase: 'old', pagesDone: 0, pagesTotal: 2 } }))
    expect(old.res.status).toBe(200)
    expect(old.body).toEqual({ cancelRequested: false })
    const dup = await post(id, report({ state: 'pausing' }))
    expect(dup.res.status).toBe(200)
    const j = await load(id)
    expect(j).toMatchObject({ reportSeq: 7, status: 'running', workerState: 'running', progressPhase: 'recognize', processedPages: 1 })
  })

  it('דיווחים במקביל בסדר מעורבב: נשאר הגבוה ביותר', async () => {
    const id = await makeJob()
    const seqs = [3, 11, 1, 8, 20, 2, 15, 19, 5, 13, 7, 17, 4, 10, 6, 9, 12, 14, 16, 18]
    const results = await Promise.all(
      seqs.map((s) => post(id, report({ reportSeq: s, state: s === 20 ? 'delivery_pending' : 'running', progress: { phase: `p${s}`, pagesDone: s, pagesTotal: 20 } })))
    )
    for (const r of results) expect(r.res.status).toBe(200)
    expect(await load(id)).toMatchObject({ reportSeq: 20, status: 'delivery_pending', progressPhase: 'p20', processedPages: 20 })
  })

  it('מעברי מצב: running → paused_runner → running → queued (חזרה לתור); startedAt נקבע פעם אחת', async () => {
    const id = await makeJob()
    await post(id, report({ reportSeq: 1 }))
    const started = (await load(id)).startedAt
    expect(started).toBeInstanceOf(Date)
    await post(id, report({ reportSeq: 2, state: 'paused_runner', message: undefined }))
    expect(await load(id)).toMatchObject({ status: 'paused_runner', workerState: 'paused_runner' })
    await new Promise((r) => setTimeout(r, 5))
    await post(id, report({ reportSeq: 3, state: 'running' }))
    const j = await load(id)
    expect(j.status).toBe('running')
    expect(j.startedAt.getTime()).toBe(started.getTime())
    await post(id, report({ reportSeq: 4, state: 'queued', attempt: 2, message: undefined }))
    expect(await load(id)).toMatchObject({ status: 'queued', attempt: 2 })
  })

  it('needs_attention: ההודעה נשמרת כטקסט; דיווח הבא בלי message מנקה אותה', async () => {
    const id = await makeJob({ status: 'running' })
    const r = await post(id, ATTENTION)
    expect(r.body).toEqual({ cancelRequested: false })
    expect(await load(id)).toMatchObject({ status: 'needs_attention', active: true, workerMessage: ATTENTION.message, processedPages: 0 })
    await post(id, report({ reportSeq: 10, message: undefined }))
    expect(await load(id)).toMatchObject({ status: 'running', workerMessage: '' })
  })

  // HANDOVER 3.1 פריט 8 (שירות 1.0.142): עבודה מוחנית (delivery_rejected) שהנתונים שלה השתנו מדווחת שוב
  // needs_attention עם message manifest_conflict; ביטול עם נתונים שהשתנו מוצג רגע כ-needs_attention ואחר כך
  // delivery_pending; requeue מחזיר queued. כל המעברים מתקבלים ב-200 (4xx כאן היה נרשם כ-status_rejected).
  it('needs_attention: delivery_rejected → manifest_conflict → delivery_pending → queued (requeue) — הכל 200', async () => {
    const id = await makeJob({ status: 'running' })
    const steps = [
      { state: 'needs_attention', message: 'delivery_rejected: the site rejected the result; it is kept on the worker' },
      { state: 'needs_attention', message: 'manifest_conflict: the site sent different immutable data (options, pageMap or input hash) for this job; the original is kept' },
      { state: 'delivery_pending', message: undefined },
      { state: 'needs_attention', message: 'manifest_conflict' },
      { state: 'queued', message: undefined },
    ]
    let seq = 20
    for (const step of steps) {
      const { res, body } = await post(id, report({ reportSeq: seq++, ...step }))
      expect(res.status, step.state).toBe(200)
      expect(body).toEqual({ cancelRequested: false })
      expect(await load(id), JSON.stringify(step)).toMatchObject({
        status: step.state,
        workerState: step.state,
        workerMessage: step.message ?? '',
        active: true,
      })
    }
  })

  it('דיווח completed / failed / cancelled לא סוגר ולא משנה status (רק workerState)', async () => {
    const id = await makeJob({ status: 'running' })
    let seq = 1
    for (const state of ['completed', 'failed', 'cancelled']) {
      const { body } = await post(id, report({ reportSeq: seq++, state, message: undefined }))
      expect(body).toEqual({ cancelRequested: false })
      const j = await load(id)
      expect(j, state).toMatchObject({ status: 'running', active: true, workerState: state, decision: null })
      expect(j.finishedAt).toBeUndefined()
    }
  })

  it('עבודה מבוטלת: לא נפתחת ולא משתנה, ומחזירה cancelRequested:true', async () => {
    const id = await makeJob({ status: 'cancelled', active: false, cancelRequested: true, decision: 'cancel', cancelReason: 'admin', reportSeq: 3 })
    const before = await load(id)
    const { res, body } = await post(id, report({ reportSeq: 50 }))
    expect(res.status).toBe(200)
    expect(body).toEqual({ cancelRequested: true })
    const after = await load(id)
    expect(after).toEqual(before) // אף שדה לא נכתב (גם לא lastSeenAt/updatedAt)
  })

  it('עבודה שהושלמה/נכשלה: לא נפתחת, cancelRequested:false', async () => {
    for (const status of ['completed', 'failed']) {
      const id = await makeJob({ status, active: false, reportSeq: 2 })
      const before = await load(id)
      const { body } = await post(id, report({ reportSeq: 9 }))
      expect(body, status).toEqual({ cancelRequested: false })
      expect(await load(id)).toEqual(before)
    }
  })

  it('עבודה פעילה עם בקשת ביטול → cancelRequested:true (גם בדיווח שהתקבל וגם בישן)', async () => {
    const id = await makeJob({ status: 'running', cancelRequested: true, reportSeq: 4 })
    expect((await post(id, report({ reportSeq: 5 }))).body).toEqual({ cancelRequested: true })
    expect((await post(id, report({ reportSeq: 1 }))).body).toEqual({ cancelRequested: true })
  })

  it('בזמן applying (החלה נעולה): status ושדות הדיווח לא משתנים, רק lastSeenAt', async () => {
    const id = await makeJob({ status: 'applying', decision: 'apply', reportSeq: 3, workerState: 'delivery_pending' })
    const before = Date.now()
    const { body } = await post(id, report({ reportSeq: 4, state: 'running' }))
    expect(body).toEqual({ cancelRequested: false })
    const j = await load(id)
    expect(j).toMatchObject({ status: 'applying', decision: 'apply', reportSeq: 3, workerState: 'delivery_pending' })
    expect(j.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before - 5)
  })

  it('גוף לא תקין: 400 bad_request (לא JSON / לא אובייקט), 422 invalid_report עם field, 413 גדול — בלי שינוי', async () => {
    const id = await makeJob()
    for (const raw of ['not json', '', '[1]', 'null', '"x"', '\uFFFD{']) {
      const { res, body } = await post(id, raw, { raw: true })
      expect(res.status, raw).toBe(400)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(body).toEqual({ error: 'bad_request' })
    }
    const cases = [
      [report({ state: 'Running' }), 'state'],
      [report({ state: 'closed' }), 'state'],
      [report({ reportSeq: 0 }), 'reportSeq'],
      [report({ attempt: -1 }), 'attempt'],
      [report({ progress: { pagesDone: -1, pagesTotal: 2 } }), 'progress.pagesDone'],
      [report({ progress: undefined }), 'progress'],
      [report({ workerId: '' }), 'workerId'],
      [report({ state: 'needs_attention', message: 'IOException at C:\\Users\\me\\job.pdf' }), 'message'],
      [report({ state: 'needs_attention', message: 'device_missing: line\nbreak' }), 'message'],
    ]
    for (const [b, field] of cases) {
      const { res, body } = await post(id, b)
      expect(res.status, field).toBe(422)
      expect(body).toEqual({ error: 'invalid_report', field })
    }
    const big = await post(id, report({ progress: { phase: 'x'.repeat(20000), pagesDone: 0, pagesTotal: 0 } }))
    expect(big.res.status).toBe(413)
    expect(big.body).toEqual({ error: 'payload_too_large' })
    expect((await load(id)).reportSeq).toBe(0)
  })

  it('workerId בגוף שונה מהמוגדר → 403 wrong_worker, בלי שינוי', async () => {
    const id = await makeJob()
    const { res, body } = await post(id, report({ workerId: 'worker-2' }))
    expect(res.status).toBe(403)
    expect(body).toEqual({ error: 'wrong_worker' })
    expect((await load(id)).reportSeq).toBe(0)
  })

  it('404 not_found: לא קיים, לא-hex, רישיות אחרת, של עובד אחר, preparing, gemini — בלי שינוי', async () => {
    const mine = await makeJob()
    const other = await makeJob({ workerId: 'worker-2' })
    const preparing = await makeJob({ status: 'preparing', inputPath: undefined, inputSha256: undefined, inputBytes: undefined, pageMap: undefined })
    const gemini = await makeJob({ method: 'gemini', requestId: undefined, inputPath: undefined, inputSha256: undefined, pageMap: undefined, status: 'running' })
    for (const id of [new mongoose.Types.ObjectId().toString(), 'job-0001', mine.toUpperCase(), other, preparing, gemini]) {
      const { res, body } = await post(id, EXAMPLE)
      expect(res.status, id).toBe(404)
      expect(body).toEqual({ error: 'not_found' })
    }
    for (const id of [other, preparing, gemini]) {
      const j = await load(id)
      expect(j.reportSeq, id).toBe(0)
      expect(j.lastSeenAt).toBeUndefined()
    }
  })

  it('staleJobs לא נוגע בעבודת local שלא עודכנה שעה (gemini ישנה כן מסומנת כשל)', async () => {
    const local = await makeJob({ status: 'running' })
    await post(local, EXAMPLE)
    const gemini = await makeJob({ method: 'gemini', requestId: undefined, inputSha256: undefined, pageMap: undefined, status: 'running' })
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    await OcrJob.collection.updateMany({}, { $set: { updatedAt: hourAgo } })
    await reapStaleOcrJobs()
    expect(await load(local)).toMatchObject({ status: 'running', active: true, reportSeq: 7 })
    expect(await load(gemini)).toMatchObject({ status: 'failed', active: false })
  })
})
