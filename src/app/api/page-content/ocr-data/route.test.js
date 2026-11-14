// @vitest-environment node
// GET /api/page-content/ocr-data מול MongoDB אמיתי (mongodb-memory-server) ותמונות JPEG אמיתיות
// בתיקייה זמנית. בלי בינארי Mongo — מדולג (כמו שאר טסטי ה-Mongo בריפו).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// images.js קורא את UPLOAD_DIR בטעינה — חייב לקרות לפני ה-imports
const env = await vi.hoisted(async () => {
  const os = await import('node:os')
  const path = await import('node:path')
  const fs = await import('node:fs')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-page-data-'))
  const uploads = path.join(tmp, 'uploads')
  process.env.UPLOAD_DIR = uploads
  return { tmp, uploads }
})

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import path from 'node:path'
import fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import sharp from 'sharp'
import Book from '@/models/Book'
import Page from '@/models/Page'
import OcrConflict from '@/models/OcrConflict'
import OcrPageResult from '@/models/OcrPageResult'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { pageApplySet, pageResultRecord } from '@/lib/ocr/localApply.pure'
import { GET } from './route'

vi.setConfig({ testTimeout: 60000 })

const FIXTURE = JSON.parse(readFileSync(path.join(process.cwd(), 'src/lib/ocr/fixtures/localResultLayout.result.json'), 'utf8'))
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const SHA = 'c'.repeat(64)
const USER = { user: { id: '507f1f77bcf86cd799439011', _id: '507f1f77bcf86cd799439011', role: 'user' } }
const ADMIN = { user: { id: '507f1f77bcf86cd799439012', _id: '507f1f77bcf86cd799439012', role: 'admin_books' } }

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  await fs.rm(env.tmp, { recursive: true, force: true })
})
beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  getServerSessionMock.mockResolvedValue(USER)
})

const jpeg = (w, h, r) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 40, b: 90 } } }).jpeg({ quality: 85 }).toBuffer()

let seq = 0
// ספר עם עמוד אחד, תמונה אמיתית, ועבודה שהחילה את עמוד 1 של הפיקסצ'ר (layout עם ה-sha והמידות של התמונה)
async function setup({ pageExtra = {} } = {}) {
  const slug = `pd${++seq}`
  const book = await Book.create({ name: `ספר ${slug}`, slug })
  const dir = path.join(env.uploads, 'books', slug)
  await fs.mkdir(dir, { recursive: true })
  const image = await jpeg(60, 80, 10)
  const imageFile = path.join(dir, 'page.1.jpg')
  await fs.writeFile(imageFile, image)
  const fixPage = structuredClone(FIXTURE.pages[0])
  fixPage.layout.image = { width: 60, height: 80, imageSha256: sha256(image) }
  const job = { _id: new mongoose.Types.ObjectId(), book: book._id }
  const page = await Page.create({ book: book._id, pageNumber: 1, imagePath: `/uploads/books/${slug}/page.1.jpg`, content: '', ...pageExtra })
  const entry = { page: page._id, pageNumber: 1, pdfPageIndex: 1, imageSha256: sha256(image) }
  const record = pageResultRecord(job, entry, fixPage, SHA, FIXTURE, new Date('2026-10-21T09:00:00Z'))
  await OcrPageResult.create({ job: job._id, page: page._id, ...record })
  await Page.updateOne({ _id: page._id }, { $set: pageApplySet(fixPage.text, job._id, SHA, new Date()) })
  return { book, page, job, slug, imageFile, fixPage }
}

const get = async (query) => {
  const res = await GET(new Request(`http://localhost/api/page-content/ocr-data?${new URLSearchParams(query)}`))
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
}

describe('GET /api/page-content/ocr-data', () => {
  it('401 בלי session; 400 בלי מזהה; Cache-Control private, no-store גם בשגיאות', async () => {
    getServerSessionMock.mockResolvedValue(null)
    const r = await get({ pageId: String(new mongoose.Types.ObjectId()) })
    expect(r.status).toBe(401)
    expect(r.cache).toBe('private, no-store')
    getServerSessionMock.mockResolvedValue(USER)
    const b = await get({})
    expect([b.status, b.body.error, b.cache]).toEqual([400, 'חסר מזהה עמוד או נתיב ספר ומספר עמוד', 'private, no-store'])
    expect((await get({ pageId: 'zzz' })).body.error).toBe('מזהה עמוד לא תקין')
    // '%' פגום ב-bookPath (decodeURIComponent היה זורק → 500) → 400 בעברית
    for (const bad of ['%E0%A4', '100%', '%zz']) {
      const m = await get({ bookPath: bad, pageNumber: '1' })
      expect([m.status, m.body.error, m.cache]).toEqual([400, 'נתיב ספר לא תקין', 'private, no-store'])
    }
    // גם בכתובת גולמית (לא דרך URLSearchParams): '%' בודד בכל הפרמטרים לא מפיל את הראוט
    const raw = await GET(new Request('http://localhost/api/page-content/ocr-data?bookPath=%25E0%25A4&pageNumber=1%'))
    expect(raw.status).toBe(400)
    const rawId = await GET(new Request('http://localhost/api/page-content/ocr-data?pageId=%E0%A4'))
    expect([rawId.status, (await rawId.json()).error]).toEqual([400, 'מזהה עמוד לא תקין'])
    expect((await get({ pageId: String(new mongoose.Types.ObjectId()) })).status).toBe(404)
  })

  it('200 current: layout כמות שהוא, image.matches:true, sizeMatches, contentMatchesOcr, אזהרות עם תווית', async () => {
    const { page, job, fixPage, slug } = await setup()
    const r = await get({ pageId: String(page._id) })
    expect(r.status).toBe(200)
    expect(r.cache).toBe('private, no-store')
    const d = r.body.data
    expect(d.state).toBe('current')
    expect(d.pageId).toBe(String(page._id))
    expect(d.pageNumber).toBe(1)
    expect(d.jobId).toBe(String(job._id))
    expect(d.resultSha256).toBe(SHA)
    expect(d.pipelineVersion).toBe(FIXTURE.pipelineVersion)
    expect(d.receivedAt).toBe('2026-10-21T09:00:00.000Z')
    expect(d.contentMatchesOcr).toBe(true)
    expect(d.image).toEqual({ expectedSha256: fixPage.layout.image.imageSha256, matches: true, width: 60, height: 80, exifOrientation: 1, sizeMatches: true })
    expect(d.layoutStatus).toBe('ok')
    expect(d.layoutVersion).toBe(1)
    expect(d.layout).toEqual(fixPage.layout)
    expect(d.metadata).toEqual(fixPage.metadata)
    expect(d.warnings).toEqual([])
    // לפי נתיב ספר ומספר עמוד — אותה תשובה
    const byPath = await get({ bookPath: slug, pageNumber: '1' })
    expect(byPath.body.data).toEqual(d)
    // העמוד נערך אחרי ה-OCR — עדיין current (אותו סימון), אבל התוכן כבר לא זהה
    await Page.updateOne({ _id: page._id }, { $set: { content: 'נערך' } })
    expect((await get({ pageId: String(page._id) })).body.data.contentMatchesOcr).toBe(false)
  })

  it('תמונה שהוחלפה → matches:false; תמונה חסרה → matches:null', async () => {
    const { page, imageFile } = await setup()
    await fs.writeFile(imageFile, await jpeg(60, 81, 200))
    const r = await get({ pageId: String(page._id) })
    expect(r.body.data.image.matches).toBe(false)
    expect(r.body.data.image.sizeMatches).toBe(false)
    await fs.rm(imageFile)
    const gone = await get({ pageId: String(page._id) })
    expect(gone.status).toBe(200)
    expect(gone.body.data.image).toMatchObject({ matches: null, width: null, height: null, sizeMatches: null })
  })

  it('403 לעמוד in-progress של משתמש אחר (כמו page-content); מנהל ספרים — 200', async () => {
    const { page } = await setup({ pageExtra: { status: 'in-progress', claimedBy: new mongoose.Types.ObjectId() } })
    const r = await get({ pageId: String(page._id) })
    expect([r.status, r.body.error, r.cache]).toEqual([403, 'הדף נמצא בטיפול על ידי משתמש אחר', 'private, no-store'])
    getServerSessionMock.mockResolvedValue(ADMIN)
    expect((await get({ pageId: String(page._id) })).status).toBe(200)
  })

  it('jobId: בלי hasBookLibraryAccess → 403; מנהל — רשומה ממתינה (pending_cancelled) / היסטוריה; 404 כשאין', async () => {
    const { page, book } = await setup()
    const otherJob = new mongoose.Types.ObjectId()
    const rec = pageResultRecord({ _id: otherJob, book: book._id }, { page: page._id, pageNumber: 1, pdfPageIndex: 1, imageSha256: 'd'.repeat(64) },
      { pdfPageIndex: 1, text: 'טקסט מבוטל' }, 'e'.repeat(64), { outcome: 'cancelled', pipelineVersion: 'v' }, new Date())
    await OcrPageResult.create({ job: otherJob, page: page._id, ...rec })
    await OcrConflict.create({ job: otherJob, book: book._id, page: page._id, pageNumber: 1, reason: 'job_cancelled', ocrText: 'טקסט מבוטל', resultSha256: 'e'.repeat(64) })

    const denied = await get({ pageId: String(page._id), jobId: String(otherJob) })
    expect([denied.status, denied.cache]).toEqual([403, 'private, no-store'])

    getServerSessionMock.mockResolvedValue(ADMIN)
    expect((await get({ pageId: String(page._id), jobId: 'bad' })).body.error).toBe('מזהה עבודה לא תקין')
    const pending = await get({ pageId: String(page._id), jobId: String(otherJob) })
    expect(pending.status).toBe(200)
    expect(pending.body.data.state).toBe('pending_cancelled')
    expect(pending.body.data.layoutStatus).toBe('absent')
    expect(pending.body.data.layout).toBe(null)
    expect(pending.body.data.image.matches).toBe(false)
    await OcrConflict.updateOne({ job: otherJob }, { $set: { status: 'dismissed' } })
    expect((await get({ pageId: String(page._id), jobId: String(otherJob) })).body.data.state).toBe('history')

    const none = await get({ pageId: String(page._id), jobId: String(new mongoose.Types.ObjectId()) })
    expect([none.status, none.body.error]).toEqual([404, 'אין נתוני OCR מקומי לטקסט הנוכחי של העמוד'])
  })

  it('רשומה יתומה (העמוד נמחק) לא מוחזרת: 404 "העמוד לא נמצא" גם עם jobId', async () => {
    const { page, job, slug } = await setup()
    await Page.deleteOne({ _id: page._id })
    expect(await OcrPageResult.countDocuments({ page: page._id })).toBe(1)
    getServerSessionMock.mockResolvedValue(ADMIN)
    for (const q of [{ pageId: String(page._id) }, { pageId: String(page._id), jobId: String(job._id) }, { bookPath: slug, pageNumber: '1' }]) {
      const r = await get(q)
      expect([r.status, r.body.error]).toEqual([404, 'העמוד לא נמצא'])
    }
  })

  it('404 כשלעמוד אין רשומה נוכחית (לא נכתב מ-OCR מקומי)', async () => {
    const book = await Book.create({ name: 'ספר בלי OCR', slug: `nocr${++seq}` })
    const page = await Page.create({ book: book._id, pageNumber: 1, imagePath: '/uploads/x.jpg' })
    const r = await get({ pageId: String(page._id) })
    expect([r.status, r.body.error, r.cache]).toEqual([404, 'אין נתוני OCR מקומי לטקסט הנוכחי של העמוד', 'private, no-store'])
  })
})
