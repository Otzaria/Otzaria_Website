// @vitest-environment node
// E2E של ספק OCR מקומי (method=local) — תנאי המעבר של שלב 1 במפרט השירות: "לקוח דמה מסוגל לסיים
// עבודה ולשלוח אותה שוב ללא כתיבה כפולה". הכול דרך פונקציות הראוטים האמיתיות (ניהול + /api/worker/v1),
// מול MongoDB אמיתי (mongodb-memory-server), תיקיות זמניות ותמונות JPEG אמיתיות. בלי בינארי Mongo —
// מדולג (כמו שאר טסטי ה-Mongo בריפו).
//
// הלקוח הדמה כאן הוא בדיוק מה שהשירות (SiteClient/JobSync/DeliverySender) עושה מול האתר:
// GET /jobs → GET /jobs/{id}/input (אימות sha256) → POST status → POST result (X-Result-SHA256) →
// שליחה חוזרת. לקוח HTTP אמיתי מול שרת רץ: scripts/ocr-local-fake-worker.mjs.
// מדריך תפעול וחוזה: docs/ocr-local-worker/OPERATIONS.md, docs/ocr-local-worker/CONTRACT.md.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// images.js ו-localStorage קוראים את התיקיות מה-env — חייב לקרות לפני ה-imports
const env = await vi.hoisted(async () => {
  const os = await import('node:os')
  const path = await import('node:path')
  const fs = await import('node:fs')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-local-e2e-'))
  const uploads = path.join(tmp, 'uploads')
  const storage = path.join(tmp, 'storage')
  process.env.UPLOAD_DIR = uploads
  process.env.OCR_LOCAL_STORAGE_DIR = storage
  return { tmp, uploads, storage }
})

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/ocr/runOcrJob', () => ({ runOcrJob: vi.fn().mockResolvedValue(undefined) }))

import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import Book from '@/models/Book'
import Page from '@/models/Page'
import OcrJob from '@/models/OcrJob'
import OcrConflict from '@/models/OcrConflict'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { runOcrJob } from '@/lib/ocr/runOcrJob'
import { POST as adminStart } from '@/app/api/admin/books/ocr/start/route'
import { POST as adminCancel } from '@/app/api/admin/books/ocr/cancel/route'
import { GET as adminStatus } from '@/app/api/admin/books/ocr/status/route'
import { GET as adminConflicts } from '@/app/api/admin/books/ocr/conflicts/route'
import { POST as adminConflictAction } from '@/app/api/admin/books/ocr/conflicts/[id]/route'
import { GET as listJobs } from './jobs/route'
import { GET as getJob } from './jobs/[id]/route'
import { GET as getInput } from './jobs/[id]/input/route'
import { POST as postStatus } from './jobs/[id]/status/route'
import { POST as postResult } from './jobs/[id]/result/route'

vi.setConfig({ testTimeout: 60000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  await fs.rm(env.tmp, { recursive: true, force: true })
})

const SECRET = 'e'.repeat(48)
const WORKER = 'worker-e2e'
const session = { user: { id: '507f1f77bcf86cd799439099', _id: '507f1f77bcf86cd799439099', name: 'מנהל ספרים', role: 'admin_books' } }
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const HEX64 = /^[0-9a-f]{64}$/
// date-time (RFC 3339) עם אזור זמן מפורש
const isIsoDateTime = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) && /(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v))
const ENVELOPE_KEYS = ['schemaVersion', 'jobId', 'taskType', 'workerId', 'createdAt', 'inputSha256', 'options', 'pageMap', 'cancelRequested', 'siteState']
const ACK_KEYS = ['ack', 'jobId', 'resultSha256', 'outcome']

let seq = 0
const newRequestId = () => `e2e-${Date.now().toString(36)}-${++seq}-abcdef`

// ---------- צד הניהול (הדיאלוג) ----------
const json = (url, body) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function start(book, requestId, extra = {}) {
  const res = await adminStart(
    json('http://localhost/api/admin/books/ocr/start', {
      bookId: String(book._id),
      method: 'local',
      requestId,
      existingTextMode: 'overwrite',
      options: { lm: 'rabbinic', defaultScript: 'square' },
      ...extra,
    })
  )
  return { status: res.status, body: await res.json() }
}

async function cancel(jobId) {
  const res = await adminCancel(json('http://localhost/api/admin/books/ocr/cancel', { jobId }))
  return { status: res.status, body: await res.json() }
}

async function adminJobView(book) {
  const res = await adminStatus(new Request(`http://localhost/api/admin/books/ocr/status?bookId=${book._id}`))
  return (await res.json()).job
}

// ---------- הלקוח הדמה (מה שהשירות עושה) ----------
const auth = { authorization: `Bearer ${SECRET}` }
const ctx = (id) => ({ params: Promise.resolve({ id }) })

function expectWorkerJson(res) {
  expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(res.headers.get('cache-control')).toBe('no-store')
}

const worker = {
  async list() {
    const res = await listJobs(new Request('http://localhost/api/worker/v1/jobs?limit=100', { headers: auth }), ctx(undefined))
    expectWorkerJson(res)
    expect(res.status).toBe(200)
    return res.json()
  },
  async get(id) {
    const res = await getJob(new Request(`http://localhost/api/worker/v1/jobs/${id}`, { headers: auth }), ctx(id))
    expectWorkerJson(res)
    return { status: res.status, body: await res.json() }
  },
  async input(id) {
    const res = await getInput(new Request(`http://localhost/api/worker/v1/jobs/${id}/input`, { headers: auth }), ctx(id))
    expect(res.status).toBe(200)
    const bytes = Buffer.from(await res.arrayBuffer())
    return { bytes, headers: res.headers }
  },
  async status(id, reportSeq, state, { pagesDone = 0, pagesTotal = 3, message } = {}) {
    const res = await postStatus(
      new Request(`http://localhost/api/worker/v1/jobs/${id}/status`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json; charset=utf-8' },
        // message נשלח רק ב-needs_attention (כמו StatusReporter.cs)
        body: JSON.stringify({ workerId: WORKER, state, progress: { phase: state, pagesDone, pagesTotal }, reportSeq, attempt: 1, ...(message ? { message } : {}) }),
      }),
      ctx(id)
    )
    expectWorkerJson(res)
    return { status: res.status, body: await res.json() }
  },
  async result(id, doc, { claimedSha } = {}) {
    const buf = Buffer.from(JSON.stringify(doc), 'utf8')
    const res = await postResult(
      new Request(`http://localhost/api/worker/v1/jobs/${id}/result`, {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': 'application/json; charset=utf-8',
          'x-result-sha256': claimedSha ?? sha256(buf),
        },
        body: buf,
      }),
      ctx(id)
    )
    expectWorkerJson(res)
    return { status: res.status, body: await res.json(), sha: sha256(buf) }
  },
}

// מסמך תוצאה (contracts/result.schema.json) — טקסט דמה לכל עמוד ב-pageMap
function resultDoc(envelope, { outcome = 'success', text = (e) => `טקסט OCR לעמוד ${e.pageNumber}`, pipelineVersion = '0.1.0-e2e' } = {}) {
  return {
    schemaVersion: 1,
    jobId: envelope.jobId,
    inputSha256: envelope.inputSha256,
    outcome,
    pipelineVersion,
    pages: outcome === 'cancelled' ? [] : envelope.pageMap.map((e) => ({ pdfPageIndex: e.pdfPageIndex, text: text(e) })),
  }
}

// ---------- נתונים ----------
const jpeg = (w, h, r) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 60, b: 120 } } }).jpeg({ quality: 85 }).toBuffer()

async function makeBook(n = 3) {
  const slug = `e2e${++seq}`
  const book = await Book.create({ name: `ספר בדיקה ${slug}`, slug })
  const dir = path.join(env.uploads, 'books', slug)
  await fs.mkdir(dir, { recursive: true })
  const images = {}
  for (let i = 1; i <= n; i++) {
    images[i] = await jpeg(60 + i, 80, i * 30)
    await fs.writeFile(path.join(dir, `page.${i}.jpg`), images[i])
    await Page.create({ book: book._id, pageNumber: i, imagePath: `/uploads/books/${slug}/page.${i}.jpg`, content: '' })
  }
  return { book, images }
}

// מצב העמודים והמונים — להשוואה לפני/אחרי שליחה חוזרת (אין כתיבה כפולה = אין שום שינוי)
async function snapshot(book, jobId) {
  const pages = await Page.find({ book: book._id }).sort({ pageNumber: 1 }).select('pageNumber content updatedAt lastOcrJobId lastOcrResultSha256 lastOcrAt').lean()
  const job = await OcrJob.findById(jobId)
    .select('status active successPages failedPages processedPages conflictPages missingPages ack ackAt finishedAt resultSha256 decision updatedAt')
    .lean()
  const conflicts = await OcrConflict.find({ job: jobId }).select('page status ocrText updatedAt').lean()
  return JSON.parse(JSON.stringify({ pages, job, conflicts }))
}

// הלקוח הדמה מושך את העבודה היחידה ברשימה ומוריד את הקלט (אימות hash כמו ב-SiteClient)
async function pickUpSingleJob() {
  const list = await worker.list()
  expect(list.items).toHaveLength(1)
  const envelope = list.items[0]
  const { bytes, headers } = await worker.input(envelope.jobId)
  expect(sha256(bytes)).toBe(envelope.inputSha256)
  expect(headers.get('x-content-sha256')).toBe(envelope.inputSha256)
  return { envelope, bytes }
}

beforeEach(async (testCtx) => {
  if (db.skip) return testCtx.skip()
  await db.reset()
  vi.clearAllMocks()
  process.env.OCR_WORKER_SECRET = SECRET
  process.env.OCR_WORKER_ID = WORKER
  getServerSessionMock.mockResolvedValue(session)
})

describe('E2E — ספק OCR מקומי: לקוח דמה מול ראוטי האתר', () => {
  it('זרימה מלאה: start (פעמיים) → jobs → input → status → result accepted → שליחה חוזרת already_received בלי כתיבה כפולה', async () => {
    const { book, images } = await makeBook(3)

    // 1–2. start עם אותו requestId פעמיים → 202 ואותה עבודה אחת
    const requestId = newRequestId()
    const first = await start(book, requestId)
    expect(first.status).toBe(202)
    expect(first.body).toMatchObject({ success: true, status: 'queued', totalPages: 3 })
    const again = await start(book, requestId)
    expect(again.status).toBe(202)
    expect(again.body.jobId).toBe(first.body.jobId)
    expect(await OcrJob.countDocuments({ book: book._id })).toBe(1)
    expect(runOcrJob).not.toHaveBeenCalled()
    const jobId = first.body.jobId

    // 3. GET /jobs — פריט אחד בצורת job-envelope.schema.json
    const list = await worker.list()
    expect(list.nextCursor).toBeNull()
    expect(list.items).toHaveLength(1)
    const envelope = list.items[0]
    expect(Object.keys(envelope)).toEqual(ENVELOPE_KEYS)
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      jobId,
      taskType: 'ocr',
      workerId: WORKER,
      options: { lm: 'rabbinic', defaultScript: 'square' },
      cancelRequested: false,
      siteState: 'queued',
    })
    expect(envelope.jobId).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(isIsoDateTime(envelope.createdAt)).toBe(true)
    expect(envelope.inputSha256).toMatch(HEX64)
    const pageDocs = await Page.find({ book: book._id }).sort({ pageNumber: 1 }).lean()
    expect(envelope.pageMap).toEqual(
      pageDocs.map((p, i) => ({
        pdfPageIndex: i + 1,
        pageId: String(p._id),
        pageNumber: p.pageNumber,
        expectedUpdatedAt: p.updatedAt.toISOString(),
        imageSha256: sha256(images[p.pageNumber]),
      }))
    )

    // 4. GET input — ה-sha256 של הבייטים שהורדו שווה ל-inputSha256; PDF תקין עם 3 עמודים
    const { bytes, headers } = await worker.input(jobId)
    expect(headers.get('content-type')).toBe('application/pdf')
    expect(headers.get('cache-control')).toBe('no-store')
    expect(Number(headers.get('content-length'))).toBe(bytes.length)
    expect(sha256(bytes)).toBe(envelope.inputSha256)
    expect(headers.get('x-content-sha256')).toBe(envelope.inputSha256)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3)

    // 5. status running (seq 1) → delivery_pending (seq 2); דיווח ישן (seq 1) לא מחזיר אחורה
    expect(await worker.status(jobId, 1, 'running', { pagesDone: 1 })).toEqual({ status: 200, body: { cancelRequested: false } })
    expect((await adminJobView(book)).status).toBe('running')
    expect(await worker.status(jobId, 2, 'delivery_pending', { pagesDone: 3 })).toEqual({ status: 200, body: { cancelRequested: false } })
    expect(await worker.status(jobId, 1, 'running', { pagesDone: 1 })).toEqual({ status: 200, body: { cancelRequested: false } })
    const pending = await adminJobView(book)
    expect(pending).toMatchObject({ status: 'delivery_pending', progress: { pagesDone: 3, pagesTotal: 3 } })
    expect(await worker.get(jobId)).toEqual({
      status: 200,
      body: { jobId, state: 'in_progress', cancelRequested: false, closed: false },
    })

    // 6. POST result → accepted (בדיוק ארבעה שדות), העמודים עודכנו
    const doc = resultDoc(envelope)
    const accepted = await worker.result(jobId, doc)
    expect(accepted.status).toBe(200)
    expect(accepted.body).toEqual({ ack: 'accepted', jobId, resultSha256: accepted.sha, outcome: 'success' })
    expect(Object.keys(accepted.body)).toEqual(ACK_KEYS)
    const pagesAfter = await Page.find({ book: book._id }).sort({ pageNumber: 1 }).lean()
    expect(pagesAfter.map((p) => p.content)).toEqual(['טקסט OCR לעמוד 1', 'טקסט OCR לעמוד 2', 'טקסט OCR לעמוד 3'])
    for (const p of pagesAfter) {
      expect(String(p.lastOcrJobId)).toBe(jobId)
      expect(p.lastOcrResultSha256).toBe(accepted.sha)
    }
    const closedView = await adminJobView(book)
    expect(closedView).toMatchObject({ status: 'completed', summary: { applied: 3, failed: 0, conflicts: 0, missing: 0 } })
    const before = await snapshot(book, jobId)
    expect(before.job).toMatchObject({ status: 'completed', active: false, successPages: 3, failedPages: 0, conflictPages: 0, missingPages: 0 })

    // 7. אותה תוצאה שוב → already_received; שום עמוד/מונה/רשומה לא השתנו
    const resent = await worker.result(jobId, doc)
    expect(resent.status).toBe(200)
    expect(resent.body).toEqual({ ack: 'already_received', jobId, resultSha256: accepted.sha, outcome: 'success' })
    expect(await snapshot(book, jobId)).toEqual(before)

    // 8. hash אחר (תוצאה אחרת) → 409 result_conflict; העמודים לא נגעו
    const other = await worker.result(jobId, resultDoc(envelope, { text: () => 'טקסט אחר' }))
    expect(other.status).toBe(409)
    expect(other.body).toMatchObject({ error: 'result_conflict' })
    expect((await snapshot(book, jobId)).pages).toEqual(before.pages)

    // 9. GET /jobs ריק
    expect(await worker.list()).toEqual({ items: [], nextCursor: null })

    // 10. GET /jobs/{id} → closed עם ה-ack השמור (זהה לראשון)
    expect(await worker.get(jobId)).toEqual({
      status: 200,
      body: { jobId, state: 'closed', cancelRequested: false, closed: true, ack: accepted.body },
    })

    // ניסיון חוזר של ה-start עם אותו requestId אחרי הסיום — אידמפוטנטי, לא עבודה חדשה
    const replay = await start(book, requestId)
    expect(replay).toMatchObject({ status: 202, body: { jobId, status: 'completed' } })
    expect(await OcrJob.countDocuments({ book: book._id })).toBe(1)
  })

  it('ביטול באמצע: הדיווח מחזיר cancelRequested, העבודה נעלמת מהרשימה, ותוצאה מאוחרת → ack=cancelled בלי לגעת בעמודים', async () => {
    const { book } = await makeBook(3)
    const started = await start(book, newRequestId())
    expect(started.status).toBe(202)
    const jobId = started.body.jobId
    const { envelope } = await pickUpSingleJob()
    expect(await worker.status(jobId, 1, 'running', { pagesDone: 1 })).toMatchObject({ body: { cancelRequested: false } })

    // המנהל מבטל → העבודה נסגרת מיד והספר משתחרר
    const cancelled = await cancel(jobId)
    expect(cancelled.status).toBe(200)
    expect(await adminJobView(book)).toMatchObject({ status: 'cancelled', cancelRequested: true, cancelReason: 'admin' })

    // העובד לומד על הביטול: מהדיווח הבא, מהרשימה (נעלמה) ומ-GET /jobs/{id}
    expect(await worker.status(jobId, 2, 'running', { pagesDone: 2 })).toEqual({ status: 200, body: { cancelRequested: true } })
    expect(await worker.list()).toEqual({ items: [], nextCursor: null })
    expect(await worker.get(jobId)).toEqual({
      status: 200,
      body: { jobId, state: 'cancelled', cancelRequested: true, closed: true },
    })
    // הקלט עדיין מוגש (ראו CONTRACT.md) — העובד יכול לסיים הורדה שהתחילה
    await worker.input(jobId)

    const pagesBefore = (await snapshot(book, jobId)).pages
    // תוצאה מאוחרת (גם success שהספיקה להיווצר) → ack=cancelled, outcome cancelled, בלי החלה
    const late = await worker.result(jobId, resultDoc(envelope))
    expect(late.status).toBe(200)
    expect(late.body).toEqual({ ack: 'cancelled', jobId, resultSha256: late.sha, outcome: 'cancelled' })
    const after = await snapshot(book, jobId)
    expect(after.pages).toEqual(pagesBefore)
    expect(after.pages.every((p) => p.content === '')).toBe(true)
    expect(after.job).toMatchObject({ status: 'cancelled', active: false })
    // שליחה חוזרת של אותה תוצאה → אותו ack, בלי שינוי
    const lateAgain = await worker.result(jobId, resultDoc(envelope))
    expect(lateAgain.body).toEqual({ ack: 'cancelled', jobId, resultSha256: late.sha, outcome: 'cancelled' })
    expect(await snapshot(book, jobId)).toEqual(after)
    expect((await worker.get(jobId)).body.ack).toEqual(late.body)

    // הספר פנוי — אפשר להתחיל עבודה חדשה
    const next = await start(book, newRequestId())
    expect(next.status).toBe(202)
    expect(next.body.jobId).not.toBe(jobId)
  })

  it('ביטול מצד העובד: תוצאת outcome=cancelled (contracts/examples/result-cancelled.json) אחרי ביטול → ack=cancelled', async () => {
    const { book } = await makeBook(2)
    const jobId = (await start(book, newRequestId())).body.jobId
    const { envelope } = await pickUpSingleJob()
    expect((await cancel(jobId)).status).toBe(200)
    const res = await worker.result(jobId, resultDoc(envelope, { outcome: 'cancelled', pipelineVersion: '' }))
    expect(res.body).toEqual({ ack: 'cancelled', jobId, resultSha256: res.sha, outcome: 'cancelled' })
  })

  it('התנגשות עם עריכה אנושית: העמוד הערוך לא נדרס, ההתנגשות נשמרת להחלטת מנהל, ושליחה חוזרת לא מחזירה אותה', async () => {
    const { book } = await makeBook(3)
    const jobId = (await start(book, newRequestId())).body.jobId
    const { envelope } = await pickUpSingleJob()
    await worker.status(jobId, 1, 'running')

    // עורך אנושי שומר את עמוד 2 בזמן שהעבודה במחשב המקומי
    const page2 = await Page.findOne({ book: book._id, pageNumber: 2 })
    await Page.updateOne({ _id: page2._id }, { $set: { content: 'עריכה אנושית' } })

    const doc = resultDoc(envelope)
    const accepted = await worker.result(jobId, doc)
    expect(accepted.body).toEqual({ ack: 'accepted', jobId, resultSha256: accepted.sha, outcome: 'success' })
    const pages = await Page.find({ book: book._id }).sort({ pageNumber: 1 }).lean()
    expect(pages.map((p) => p.content)).toEqual(['טקסט OCR לעמוד 1', 'עריכה אנושית', 'טקסט OCR לעמוד 3'])
    expect(await adminJobView(book)).toMatchObject({ status: 'completed', summary: { applied: 2, failed: 0, conflicts: 1, missing: 0 } })

    // שליחה חוזרת → already_received; ההתנגשות לא נוצרת שוב והעריכה האנושית נשארת
    const beforeResend = await snapshot(book, jobId)
    expect(beforeResend.conflicts).toHaveLength(1)
    expect((await worker.result(jobId, doc)).body.ack).toBe('already_received')
    expect(await snapshot(book, jobId)).toEqual(beforeResend)

    // ממשק הניהול: רשימת ההתנגשויות של העבודה
    const listRes = await adminConflicts(new Request(`http://localhost/api/admin/books/ocr/conflicts?jobId=${jobId}`))
    const { conflicts } = await listRes.json()
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({ pageNumber: 2, status: 'open', ocrText: 'טקסט OCR לעמוד 2', pageContent: 'עריכה אנושית' })

    // אימוץ טקסט ה-OCR עם updatedAt ישן (העמוד נערך שוב בינתיים) → 409, בלי דריסה
    const act = (body) =>
      adminConflictAction(json(`http://localhost/api/admin/books/ocr/conflicts/${conflicts[0].id}`, body), ctx(conflicts[0].id))
    const stale = await act({ action: 'apply', expectedPageUpdatedAt: conflicts[0].expectedUpdatedAt })
    expect(stale.status).toBe(409)
    expect((await Page.findById(page2._id).lean()).content).toBe('עריכה אנושית')

    // עם ה-updatedAt הנוכחי → הוחל במפורש בידי המנהל
    const applied = await act({ action: 'apply', expectedPageUpdatedAt: conflicts[0].pageUpdatedAt })
    expect(applied.status).toBe(200)
    expect((await applied.json()).conflict).toMatchObject({ status: 'applied', resolvedByName: 'מנהל ספרים' })
    expect((await Page.findById(page2._id).lean()).content).toBe('טקסט OCR לעמוד 2')

    // ושליחה חוזרת נוספת של התוצאה לא משנה דבר (גם לא את ההתנגשות שטופלה)
    const afterApply = await snapshot(book, jobId)
    expect((await worker.result(jobId, doc)).body.ack).toBe('already_received')
    expect(await snapshot(book, jobId)).toEqual(afterApply)
  })

  it('קריסה באמצע ההחלה (חריגה אחרי עמוד אחד) → 500; שליחה חוזרת מסיימת בלי לכתוב שוב עמוד שכבר נכתב', async () => {
    const { book } = await makeBook(3)
    const jobId = (await start(book, newRequestId())).body.jobId
    const { envelope } = await pickUpSingleJob()
    await worker.status(jobId, 1, 'delivery_pending', { pagesDone: 3 })
    const doc = resultDoc(envelope)

    const original = Page.updateOne.bind(Page)
    let calls = 0
    const spy = vi.spyOn(Page, 'updateOne').mockImplementation((...args) => {
      calls++
      if (calls === 2) throw new Error('simulated crash during apply')
      return original(...args)
    })
    let crashed
    try {
      crashed = await worker.result(jobId, doc)
    } finally {
      spy.mockRestore()
    }
    expect(crashed.status).toBe(500)
    expect(crashed.body).toEqual({ error: 'internal_error' })
    const mid = await snapshot(book, jobId)
    expect(mid.job).toMatchObject({ status: 'applying', decision: 'apply', ack: null, active: true })
    const writtenBefore = mid.pages.filter((p) => p.lastOcrJobId === jobId)
    expect(writtenBefore.length).toBeGreaterThanOrEqual(1)
    expect(writtenBefore.length).toBeLessThan(3)

    // שליחה חוזרת (כפי שהשירות עושה אחרי 5xx) → accepted, כל העמודים, מונים נכונים
    const resent = await worker.result(jobId, doc)
    expect(resent.body).toEqual({ ack: 'accepted', jobId, resultSha256: resent.sha, outcome: 'success' })
    const done = await snapshot(book, jobId)
    expect(done.pages.map((p) => p.content)).toEqual(['טקסט OCR לעמוד 1', 'טקסט OCR לעמוד 2', 'טקסט OCR לעמוד 3'])
    expect(done.job).toMatchObject({ status: 'completed', active: false, successPages: 3, failedPages: 0, conflictPages: 0 })
    expect(done.conflicts).toEqual([])
    // עמוד שנכתב לפני הקריסה לא נכתב שוב (updatedAt ו-lastOcrAt זהים)
    for (const p of writtenBefore) {
      expect(done.pages.find((q) => q._id === p._id)).toEqual(p)
    }
    expect((await worker.result(jobId, doc)).body.ack).toBe('already_received')
    expect(await snapshot(book, jobId)).toEqual(done)
  })
})
