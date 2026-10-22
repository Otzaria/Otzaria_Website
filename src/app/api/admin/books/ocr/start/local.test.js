// @vitest-environment node
// POST /api/admin/books/ocr/start עם method=local — מול MongoDB אמיתי (mongodb-memory-server)
// ותמונות JPEG אמיתיות בתיקייה זמנית. בלי בינארי Mongo — הבדיקות מדולגות.
//
// מכסה: 202 רק אחרי PDF עמיד + queued; אידמפוטנטיות לפי requestId (אותו קלט → אותה עבודה,
// קלט אחר → 409); חסימה לפי עבודה פעילה לספר (כולל מרוץ על book_active_unique); הכנה שנקטעה
// ממשיכה באותו requestId; שגיאת קלט קבועה מול זמנית; skip; תצורה חסרה; runOcrJob לא נקרא.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// images.js ו-localStorage קוראים את התיקיות מה-env — חייב לקרות לפני ה-imports
const env = await vi.hoisted(async () => {
  const os = await import('node:os')
  const path = await import('node:path')
  const fs = await import('node:fs')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-local-start-'))
  const uploads = path.join(tmp, 'uploads')
  const storage = path.join(tmp, 'storage')
  process.env.UPLOAD_DIR = uploads
  process.env.OCR_LOCAL_STORAGE_DIR = storage
  return { tmp, uploads, storage }
})

const { getServerSessionMock, buildCtl } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  buildCtl: { failNext: 0, calls: 0, hold: null },
}))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
// ראוט מחיקת הספר מרענן תגית מטמון — מחוץ ל-Next אין store לזה
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/ocr/runOcrJob', () => ({ runOcrJob: vi.fn().mockResolvedValue(undefined) }))
// buildJobInput האמיתי, עם אפשרות להכשיל פעם אחת בתקלה זמנית (כמו EIO באמצע הכתיבה)
vi.mock('@/lib/ocr/localPdf', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    buildJobInput: async (args) => {
      buildCtl.calls++
      if (buildCtl.failNext > 0) {
        buildCtl.failNext--
        throw Object.assign(new Error('simulated I/O failure'), { code: 'EIO' })
      }
      // עצירה לפני הבנייה — מדמה מחזיק lease איטי (התהליך עוד עובד אחרי שה-lease פג)
      if (buildCtl.hold) {
        const h = buildCtl.hold
        buildCtl.hold = null
        h.entered()
        await h.release
      }
      return actual.buildJobInput(args)
    },
  }
})

import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import Book from '@/models/Book'
import Page from '@/models/Page'
import OcrJob from '@/models/OcrJob'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { runOcrJob } from '@/lib/ocr/runOcrJob'
import { relToAbs } from '@/lib/ocr/localStorage'
import { POST } from './route'
import { POST as cancelPOST } from '../cancel/route'
import { DELETE as deleteBook } from '../../delete/route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  await fs.rm(env.tmp, { recursive: true, force: true })
})

const sha = (b) => createHash('sha256').update(b).digest('hex')
const solid = (w, h, r) => sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 40, b: 90 } } }).jpeg({ quality: 85 }).toBuffer()
const SECRET = 'k'.repeat(48)
const session = { user: { id: '507f1f77bcf86cd799439099', _id: '507f1f77bcf86cd799439099', name: 'מנהל ספרים', role: 'admin_books' } }

let book
let images
let seq = 0
const rid = () => `req-${Date.now().toString(36)}-${++seq}-abcdef`

function post(body) {
  return new Request('http://localhost/api/admin/books/ocr/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const start = async (extra = {}) => {
  const res = await POST(post({ bookId: String(book._id), method: 'local', existingTextMode: 'overwrite', ...extra }))
  return { res, body: await res.json() }
}

async function makeBook(slug, pages) {
  const b = await Book.create({ name: `ספר ${slug}`, slug })
  const dir = path.join(env.uploads, 'books', slug)
  await fs.mkdir(dir, { recursive: true })
  const imgs = {}
  for (const { n, content = '', w = 60 + n, h = 80 } of pages) {
    imgs[n] = await solid(w, h, n * 20)
    await fs.writeFile(path.join(dir, `page.${n}.jpg`), imgs[n])
    await Page.create({ book: b._id, pageNumber: n, imagePath: `/uploads/books/${slug}/page.${n}.jpg`, content })
  }
  return { b, imgs }
}

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  buildCtl.failNext = 0
  buildCtl.calls = 0
  buildCtl.hold = null
  process.env.OCR_WORKER_SECRET = SECRET
  process.env.OCR_WORKER_ID = 'worker-1'
  getServerSessionMock.mockResolvedValue(session)
  const slug = `b${++seq}`
  // סדר יצירה מעורבב — ה-PDF חייב להיות לפי pageNumber
  ;({ b: book, imgs: images } = await makeBook(slug, [{ n: 3 }, { n: 1 }, { n: 2, content: 'כבר יש טקסט' }]))
})

describe('יצירה', () => {
  it('202 queued רק אחרי שה-PDF נשמר: קובץ קיים, hash תואם, pageMap לפי סדר העמודים', async () => {
    const requestId = rid()
    const { res, body } = await start({ requestId })
    expect(res.status).toBe(202)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(body).toEqual({ success: true, jobId: expect.stringMatching(/^[a-f0-9]{24}$/), status: 'queued', totalPages: 3 })
    expect(runOcrJob).not.toHaveBeenCalled()

    const job = await OcrJob.findById(body.jobId).lean()
    expect(job).toMatchObject({
      method: 'local',
      status: 'queued',
      active: true,
      requestId,
      workerId: 'worker-1',
      taskType: 'ocr',
      existingTextMode: 'overwrite',
      options: { lm: 'rabbinic', defaultScript: 'square' },
      totalPages: 3,
      editedPagesCount: 1,
      startedByName: 'מנהל ספרים',
    })
    expect(job.prepLeaseUntil).toBeNull()
    expect(job.preparedAt).toBeInstanceOf(Date)
    expect(job.requestFingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(job.inputPath).toBe(`${body.jobId}/input-${job.inputSha256}.pdf`)

    const abs = relToAbs(job.inputPath)
    expect(abs.startsWith(path.resolve(env.storage) + path.sep)).toBe(true)
    const pdf = await fs.readFile(abs)
    expect(sha(pdf)).toBe(job.inputSha256)
    expect(pdf.length).toBe(job.inputBytes)
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(3)

    const pages = await Page.find({ book: book._id }).sort({ pageNumber: 1 }).lean()
    expect(job.pageMap.map((e) => [e.pdfPageIndex, e.pageNumber, String(e.page), e.imageSha256, e.expectedUpdatedAt.getTime()])).toEqual(
      pages.map((p, i) => [i + 1, p.pageNumber, String(p._id), sha(images[p.pageNumber]), p.updatedAt.getTime()])
    )
  })

  it('אותו requestId פעמיים → אותה עבודה, רשומה אחת, בלי לבנות שוב', async () => {
    const requestId = rid()
    const a = await start({ requestId })
    const st = await fs.stat(relToAbs((await OcrJob.findById(a.body.jobId).lean()).inputPath))
    const b = await start({ requestId })
    expect(a.res.status).toBe(202)
    expect(b.res.status).toBe(202)
    expect(b.body).toEqual(a.body)
    expect(await OcrJob.countDocuments({})).toBe(1)
    expect(buildCtl.calls).toBe(1)
    const job = await OcrJob.findById(a.body.jobId).lean()
    expect((await fs.stat(relToAbs(job.inputPath))).mtimeMs).toBe(st.mtimeMs)
  })

  it('אותו requestId עם קלט אחר → 409 request_conflict', async () => {
    const requestId = rid()
    await start({ requestId })
    for (const extra of [{ existingTextMode: 'skip' }, { options: { lm: 'off' } }]) {
      const { res, body } = await start({ requestId, ...extra })
      expect(res.status).toBe(409)
      expect(body.code).toBe('request_conflict')
      expect(body.error).toMatch(/[א-ת]/)
    }
    expect(await OcrJob.countDocuments({})).toBe(1)
  })

  it('requestId אחר על ספר עם עבודה פעילה → 409 עם jobId', async () => {
    const first = await start({ requestId: rid() })
    const { res, body } = await start({ requestId: rid() })
    expect(res.status).toBe(409)
    expect(body).toMatchObject({ code: 'active_job', jobId: first.body.jobId })
    expect(await OcrJob.countDocuments({})).toBe(1)
  })

  it('עבודת ocrwin פעילה חוסמת local, ו-ocrwin לא השתנה (200 + runOcrJob)', async () => {
    const ocrwin = await POST(post({ bookId: String(book._id), method: 'ocrwin', existingTextMode: 'overwrite' }))
    expect(ocrwin.status).toBe(200)
    expect(runOcrJob).toHaveBeenCalledTimes(1)
    const { res, body } = await start({ requestId: rid() })
    expect(res.status).toBe(409)
    expect(body.code).toBe('active_job')
  })

  it('skip שולח רק עמודים בלי טקסט', async () => {
    const { res, body } = await start({ requestId: rid(), existingTextMode: 'skip' })
    expect(res.status).toBe(202)
    expect(body.totalPages).toBe(2)
    const job = await OcrJob.findById(body.jobId).lean()
    expect(job.pageMap.map((e) => e.pageNumber)).toEqual([1, 3])
    expect((await PDFDocument.load(await fs.readFile(relToAbs(job.inputPath)))).getPageCount()).toBe(2)
  })

  it('options מה-whitelist נשמרים', async () => {
    const { body } = await start({ requestId: rid(), options: { lm: 'modern', defaultScript: 'rashi' } })
    expect((await OcrJob.findById(body.jobId).lean()).options).toEqual({ lm: 'modern', defaultScript: 'rashi' })
  })

  it('מרוץ: שתי בקשות במקביל עם אותו requestId → עבודה אחת', async () => {
    const requestId = rid()
    const results = await Promise.all([start({ requestId }), start({ requestId })])
    const statuses = results.map((r) => r.res.status).sort()
    expect(statuses[0]).toBe(202)
    // השנייה: 202 (אם הגיעה אחרי הסיום) או 409 preparing (אם ההכנה עוד רצה)
    expect([202, 409]).toContain(statuses[1])
    if (statuses[1] === 409) expect(results.find((r) => r.res.status === 409).body.code).toBe('preparing')
    expect(await OcrJob.countDocuments({})).toBe(1)
    expect(new Set(results.map((r) => r.body.jobId)).size).toBe(1)
  })

  it('מרוץ: שני requestId שונים במקביל על אותו ספר → אחד 202, השני 409 (book_active_unique)', async () => {
    const results = await Promise.all([start({ requestId: rid() }), start({ requestId: rid() })])
    expect(results.map((r) => r.res.status).sort()).toEqual([202, 409])
    expect(results.find((r) => r.res.status === 409).body.code).toBe('active_job')
    expect(await OcrJob.countDocuments({ active: true })).toBe(1)
  })
})

describe('הכנה שנקטעה', () => {
  it('תקלה זמנית ב-buildJobInput → 500 בלי 202, העבודה preparing; ניסיון חוזר באותו requestId → 202', async () => {
    const requestId = rid()
    buildCtl.failNext = 1
    const first = await start({ requestId })
    expect(first.res.status).toBe(500)
    expect(first.body).toMatchObject({ code: 'preparation_retry', jobId: expect.any(String) })
    expect(first.body.error).toMatch(/[א-ת]/)
    expect(first.body.success).toBeUndefined()
    const pending = await OcrJob.findById(first.body.jobId).lean()
    expect(pending).toMatchObject({ status: 'preparing', active: true })
    expect(pending.inputPath).toBeUndefined()
    expect(pending.pageMap).toBeUndefined()

    // requestId אחר עדיין חסום (העבודה פעילה)
    expect((await start({ requestId: rid() })).res.status).toBe(409)

    const retry = await start({ requestId })
    expect(retry.res.status).toBe(202)
    expect(retry.body).toMatchObject({ jobId: first.body.jobId, status: 'queued', totalPages: 3 })
    expect(await OcrJob.countDocuments({})).toBe(1)
  })

  it('lease בתוקף (הכנה רצה בבקשה אחרת) → 409 preparing; אחרי שפג → ממשיכים ל-202', async () => {
    const requestId = rid()
    buildCtl.failNext = 1
    const first = await start({ requestId })
    // מדמים בקשה אחרת שמחזיקה lease בתוקף
    await OcrJob.updateOne({ _id: first.body.jobId }, { $set: { prepLeaseUntil: new Date(Date.now() + 60_000) } })
    const busy = await start({ requestId })
    expect(busy.res.status).toBe(409)
    expect(busy.body).toMatchObject({ code: 'preparing', jobId: first.body.jobId })

    // ה-lease פג (תהליך שקרס באמצע) — הניסיון החוזר לוקח אותו וממשיך
    await OcrJob.updateOne({ _id: first.body.jobId }, { $set: { prepLeaseUntil: new Date(Date.now() - 1000) } })
    const done = await start({ requestId })
    expect(done.res.status).toBe(202)
    expect(done.body.jobId).toBe(first.body.jobId)
  })

  it('הכנה נטושה של בקשה אחרת (lease פג לפני יותר מ-15 דקות) נסגרת, והספר מתפנה', async () => {
    buildCtl.failNext = 1
    const stale = await start({ requestId: rid() })
    await OcrJob.updateOne({ _id: stale.body.jobId }, { $set: { prepLeaseUntil: new Date(Date.now() - 5 * 60_000) } })
    // 5 דקות — עדיין לא נטושה
    expect((await start({ requestId: rid() })).res.status).toBe(409)

    await OcrJob.updateOne({ _id: stale.body.jobId }, { $set: { prepLeaseUntil: new Date(Date.now() - 20 * 60_000) } })
    const fresh = await start({ requestId: rid() })
    expect(fresh.res.status).toBe(202)
    expect(await OcrJob.findById(stale.body.jobId).lean()).toMatchObject({
      status: 'failed',
      active: false,
      errorCode: 'prep_abandoned',
      error: 'הכנת הקלט נקטעה',
    })
  })
})

describe('שגיאות קלט קבועות', () => {
  it('תמונה חסרה → 422 missing_image, העבודה failed ומשחררת את הספר; אותו requestId → אותה שגיאה', async () => {
    await fs.rm(path.join(env.uploads, 'books', book.slug, 'page.3.jpg'))
    const requestId = rid()
    const { res, body } = await start({ requestId })
    expect(res.status).toBe(422)
    expect(body).toMatchObject({ code: 'missing_image', pageNumbers: [3] })
    expect(body.error).toMatch(/3/)
    expect(await OcrJob.findById(body.jobId).lean()).toMatchObject({ status: 'failed', active: false, errorCode: 'missing_image' })

    const again = await start({ requestId })
    expect(again.res.status).toBe(422)
    expect(again.body).toMatchObject({ code: 'missing_image', jobId: body.jobId })
    expect(buildCtl.calls).toBe(1)

    // הספר פנוי: אחרי תיקון התמונה, בקשה חדשה מצליחה
    await fs.writeFile(path.join(env.uploads, 'books', book.slug, 'page.3.jpg'), images[3])
    expect((await start({ requestId: rid() })).res.status).toBe(202)
  })

  it('אין עמודים לעיבוד (skip וכולם ערוכים) → 400, העבודה failed', async () => {
    await Page.updateMany({ book: book._id }, { $set: { content: 'טקסט' } })
    const { res, body } = await start({ requestId: rid(), existingTextMode: 'skip' })
    expect(res.status).toBe(400)
    expect(body.code).toBe('no_pages')
    expect(body.error).toMatch(/[א-ת]/)
    expect(await OcrJob.countDocuments({ active: true })).toBe(0)
  })

  it('חריגה ממגבלת העמודים → 413', async () => {
    process.env.OCR_LOCAL_MAX_PAGES = '2'
    try {
      const { res, body } = await start({ requestId: rid() })
      expect(res.status).toBe(413)
      expect(body.code).toBe('too_many_pages')
      expect(await OcrJob.countDocuments({ active: true })).toBe(0)
    } finally {
      delete process.env.OCR_LOCAL_MAX_PAGES
    }
  })
})

describe('ולידציה, תצורה והרשאות', () => {
  it('תצורת עובד חסרה או חלשה → 503 בלי ליצור רשומה', async () => {
    delete process.env.OCR_WORKER_SECRET
    const missing = await start({ requestId: rid() })
    expect(missing.res.status).toBe(503)
    expect(missing.body.error).toBe('ספק המחשב המקומי אינו מוגדר בשרת')
    process.env.OCR_WORKER_SECRET = 'short'
    expect((await start({ requestId: rid() })).res.status).toBe(503)
    expect(await OcrJob.countDocuments({})).toBe(0)
  })

  it('קלט לא תקין → 400 בעברית בלי ליצור רשומה', async () => {
    for (const extra of [{}, { requestId: 'bad id!' }, { requestId: rid(), splitColumns: true }, { requestId: rid(), options: { lm: 'gpt' } }]) {
      const { res, body } = await start(extra)
      expect(res.status, JSON.stringify(extra)).toBe(400)
      expect(body.error).toMatch(/[א-ת]/)
    }
    expect(await OcrJob.countDocuments({})).toBe(0)
  })

  it('401 בלי session, 403 בלי הרשאת ספרייה', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await start({ requestId: rid() })).res.status).toBe(401)
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'admin_ocr' } })
    expect((await start({ requestId: rid() })).res.status).toBe(403)
    expect(await OcrJob.countDocuments({})).toBe(0)
  })
})

describe('QA שלב 4: מרוצים ומקרי קצה', () => {
  const holdBuild = () => {
    let entered
    let release
    const h = {
      entered: null,
      release: new Promise((r) => { release = r }),
      wait: new Promise((r) => { entered = r }),
    }
    h.entered = entered
    buildCtl.hold = h
    return { wait: h.wait, release }
  }
  const inputFiles = async (jobId) => fs.readdir(path.join(env.storage, jobId)).catch(() => [])

  it('lease פג בזמן שהמחזיק עוד עובד (אותו קלט) → עבודה queued אחת, הקובץ הזוכה נשאר ותואם ל-hash', async () => {
    const requestId = rid()
    const hold = holdBuild()
    const slow = start({ requestId })
    await hold.wait
    const job = await OcrJob.findOne({ requestId }).lean()
    // ה-lease של הבקשה האיטית פג — בקשה חוזרת לוקחת אותו ומסיימת
    await OcrJob.updateOne({ _id: job._id }, { $set: { prepLeaseUntil: new Date(Date.now() - 1000) } })
    const fast = await start({ requestId })
    expect(fast.res.status).toBe(202)
    hold.release()
    const late = await slow
    expect(late.res.status).toBe(202)
    expect(late.body).toMatchObject({ jobId: String(job._id), status: 'queued' })
    const done = await OcrJob.findById(job._id).lean()
    expect(done.status).toBe('queued')
    const buf = await fs.readFile(relToAbs(done.inputPath))
    expect(sha(buf)).toBe(done.inputSha256)
    expect((await inputFiles(String(job._id))).filter((f) => f.endsWith('.pdf'))).toHaveLength(1)
  })

  it('lease פג והקלט השתנה בינתיים → נשאר רק הקובץ של הזוכה, הקובץ של המפסיד נמחק', async () => {
    const requestId = rid()
    const hold = holdBuild()
    const slow = start({ requestId })
    await hold.wait
    const job = await OcrJob.findOne({ requestId }).lean()
    await OcrJob.updateOne({ _id: job._id }, { $set: { prepLeaseUntil: new Date(Date.now() - 1000) } })
    const fast = await start({ requestId })
    expect(fast.res.status).toBe(202)
    // תמונה של עמוד השתנתה לפני שהבקשה האיטית בונה — ה-PDF שלה שונה
    await fs.writeFile(path.join(env.uploads, 'books', book.slug, 'page.1.jpg'), await solid(90, 90, 200))
    hold.release()
    const late = await slow
    expect(late.res.status).toBe(202)
    const done = await OcrJob.findById(job._id).lean()
    const files = (await inputFiles(String(job._id))).filter((f) => f.endsWith('.pdf'))
    expect(files).toEqual([path.basename(done.inputPath)])
    expect(sha(await fs.readFile(relToAbs(done.inputPath)))).toBe(done.inputSha256)
  })

  it('ביטול בזמן ההכנה (דרך ראוט הביטול) → אין 202, העבודה לא עוברת ל-queued והקובץ נמחק', async () => {
    const requestId = rid()
    const hold = holdBuild()
    const pending = start({ requestId })
    await hold.wait
    const job = await OcrJob.findOne({ requestId }).lean()
    const cancelRes = await cancelPOST(post({ bookId: String(book._id) }))
    expect(cancelRes.status).toBe(200)
    expect(await OcrJob.findById(job._id).lean()).toMatchObject({
      status: 'cancelled',
      active: false,
      decision: 'cancel',
      cancelReason: 'admin',
      cancelledByName: 'מנהל ספרים',
      prepLeaseUntil: null,
    })
    hold.release()
    const { res, body } = await pending
    expect(res.status).toBe(409)
    expect(body.code).toBe('cancelled')
    const after = await OcrJob.findById(job._id).lean()
    expect(after.status).toBe('cancelled')
    expect(after.inputPath).toBeUndefined()
    expect((await inputFiles(String(job._id))).filter((f) => f.endsWith('.pdf'))).toHaveLength(0)
    // ניסיון חוזר באותו requestId — אותה תשובה, לא 202
    expect((await start({ requestId })).res.status).toBe(409)
  })

  it('ספר לא קיים → 404 בלי ליצור רשומה; requestId ארוך מדי → 400', async () => {
    const missing = await POST(post({ bookId: '507f1f77bcf86cd799439011', method: 'local', existingTextMode: 'overwrite', requestId: rid() }))
    expect(missing.status).toBe(404)
    expect((await start({ requestId: 'a'.repeat(65) })).res.status).toBe(400)
    expect((await start({ requestId: { $gt: '' } })).res.status).toBe(400)
    expect(await OcrJob.countDocuments({})).toBe(0)
  })

  it('אותו requestId עם options בסדר מפתחות אחר / ברירות מחדל מפורשות → אותה עבודה', async () => {
    const requestId = rid()
    const first = await start({ requestId })
    expect(first.res.status).toBe(202)
    const again = await start({ requestId, options: { defaultScript: 'square', lm: 'rabbinic' } })
    expect(again.res.status).toBe(202)
    expect(again.body.jobId).toBe(first.body.jobId)
  })

  it('הכנת local נטושה אינה חוסמת לעד את OCRWin', async () => {
    buildCtl.failNext = 1
    const stale = await start({ requestId: rid() })
    expect(stale.res.status).toBe(500)
    // עדיין לא נטושה — ocrwin נחסם כמו היום
    const blocked = await POST(post({ bookId: String(book._id), method: 'ocrwin', existingTextMode: 'overwrite' }))
    expect(blocked.status).toBe(409)
    await OcrJob.updateOne({ _id: stale.body.jobId }, { $set: { prepLeaseUntil: new Date(Date.now() - 20 * 60_000) } })
    const ocrwin = await POST(post({ bookId: String(book._id), method: 'ocrwin', existingTextMode: 'overwrite' }))
    expect(ocrwin.status).toBe(200)
    expect(runOcrJob).toHaveBeenCalledTimes(1)
    expect(await OcrJob.findById(stale.body.jobId).lean()).toMatchObject({ status: 'failed', active: false, errorCode: 'prep_abandoned' })
  })
})

describe('שלב 5: ביטול, נעילת החלטה ומחיקת ספר (ראוטים אמיתיים)', () => {
  const cancel = async (body) => {
    const res = await cancelPOST(post(body))
    return { res, body: await res.json() }
  }

  it('ביטול queued → 200, cancelled מתועד, והספר פנוי לעבודה חדשה', async () => {
    const first = await start({ requestId: rid() })
    expect(first.res.status).toBe(202)
    const c = await cancel({ jobId: first.body.jobId })
    expect(c.res.status).toBe(200)
    expect(c.body).toEqual({ success: true })
    const job = await OcrJob.findById(first.body.jobId).lean()
    expect(job).toMatchObject({ status: 'cancelled', active: false, cancelRequested: true, decision: 'cancel', cancelReason: 'admin' })
    // קלט ופרטי האימות נשמרים לקליטה מאוחרת (ack=cancelled בשלב 8)
    expect(job.inputSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(job.pageMap).toHaveLength(3)
    expect(await fs.stat(relToAbs(job.inputPath))).toBeTruthy()
    // ביטול נוסף — אין עבודה פעילה
    expect((await cancel({ bookId: String(book._id) })).res.status).toBe(404)
    const second = await start({ requestId: rid() })
    expect(second.res.status).toBe(202)
    expect(second.body.jobId).not.toBe(first.body.jobId)
  })

  it('ביטול אחרי שהקליטה החלה (decision=apply) → 409 בעברית, העבודה לא משתנה', async () => {
    const first = await start({ requestId: rid() })
    await OcrJob.updateOne({ _id: first.body.jobId }, { $set: { status: 'applying', decision: 'apply', resultSha256: 'f'.repeat(64) } })
    const before = await OcrJob.findById(first.body.jobId).lean()
    const c = await cancel({ bookId: String(book._id) })
    expect(c.res.status).toBe(409)
    expect(c.body).toEqual({ error: 'הקליטה כבר החלה — לא ניתן לבטל', code: 'apply_started' })
    expect(await OcrJob.findById(first.body.jobId).lean()).toEqual(before)
  })

  it('מחיקת ספר עם עבודה פעילה → העבודה נשארת כהיסטוריה, cancelled עם cancelReason=book_deleted', async () => {
    const first = await start({ requestId: rid() })
    const res = await deleteBook(post({ bookId: String(book._id) }))
    expect(res.status).toBe(200)
    expect(await Book.findById(book._id).lean()).toBeNull()
    expect(await Page.countDocuments({ book: book._id })).toBe(0)
    const job = await OcrJob.findById(first.body.jobId).lean()
    expect(job).toMatchObject({
      status: 'cancelled',
      active: false,
      decision: 'cancel',
      cancelReason: 'book_deleted',
      cancelledByName: 'מנהל ספרים',
    })
    expect(job.cancelledAt).toBeInstanceOf(Date)
  })

  it('מחיקת ספר בזמן קליטת תוצאה → 409 ושום דבר לא נמחק', async () => {
    const first = await start({ requestId: rid() })
    await OcrJob.updateOne({ _id: first.body.jobId }, { $set: { status: 'applying', decision: 'apply' } })
    const res = await deleteBook(post({ bookId: String(book._id) }))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('apply_started')
    expect(await Book.findById(book._id).lean()).not.toBeNull()
    expect(await Page.countDocuments({ book: book._id })).toBe(3)
    expect((await OcrJob.findById(first.body.jobId).lean()).status).toBe('applying')
  })
})
