// @vitest-environment node
// מסלול הבעלים מקצה לקצה מול MongoDB אמיתי (mongodb-memory-server) ותמונות JPEG אמיתיות: ספר אישי
// בדיוק כמו ש"הספרים שלי" יוצר אותו (POST /api/user/upload — מוסתר, אישי, העמודים תפוסים בידי הבעלים)
// נשלח למחשב המקומי, נראה במצב, ונעצר — ושום דבר בספר האישי לא משתנה. בלי בינארי Mongo — מדולג.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

const env = await vi.hoisted(async () => {
  const os = await import('node:os')
  const path = await import('node:path')
  const fs = await import('node:fs')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-owner-flow-'))
  process.env.UPLOAD_DIR = path.join(tmp, 'uploads')
  process.env.OCR_LOCAL_STORAGE_DIR = path.join(tmp, 'storage')
  return { tmp, uploads: process.env.UPLOAD_DIR }
})

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/ocr/runOcrJob', () => ({ runOcrJob: vi.fn().mockResolvedValue(undefined) }))

import path from 'node:path'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import Book from '@/models/Book'
import Page from '@/models/Page'
import OcrJob from '@/models/OcrJob'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { POST as start } from './route'
import { GET as status } from '../status/route'
import { POST as cancel } from '../cancel/route'
import { GET as adminStatus } from '@/app/api/admin/books/ocr/status/route'
import { POST as adminCancel } from '@/app/api/admin/books/ocr/cancel/route'
import { GET as search } from '@/app/api/search/route'
import { GET as example } from '@/app/api/book/[id]/example/route'

vi.setConfig({ testTimeout: 30000 })

const OWNER = '507f1f77bcf86cd799439099'
const OTHER = '507f1f77bcf86cd799439098'
const asUser = (id, roles = ['private_ocr']) => getServerSessionMock.mockResolvedValue({ user: { id, _id: id, name: `משתמש ${id.slice(-2)}`, role: 'user', roles } })
const json = (url, body) => new Request(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const get = (url) => new Request(`http://localhost${url}`)

let db
let book
beforeAll(async () => { db = await startMongo() }, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  await fs.rm(env.tmp, { recursive: true, force: true })
})

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  process.env.OCR_WORKER_SECRET = 'k'.repeat(48)
  process.env.OCR_WORKER_ID = 'worker-1'
  const slug = 'u-9099-sefer'
  const dir = path.join(env.uploads, 'books', slug)
  await fs.mkdir(dir, { recursive: true })
  // כמו POST /api/user/upload
  book = await Book.create({
    name: 'ספר אישי', slug, category: 'אישי - בעלים', folderPath: `/uploads/books/${slug}`, totalPages: 2,
    isHidden: true, isPrivate: true, ownerId: OWNER, originalOwnerId: OWNER,
  })
  for (const n of [1, 2]) {
    await fs.writeFile(path.join(dir, `page.${n}.jpg`), await sharp({ create: { width: 60, height: 80, channels: 3, background: { r: n * 40, g: 40, b: 90 } } }).jpeg().toBuffer())
    await Page.create({ book: book._id, pageNumber: n, imagePath: `/uploads/books/${slug}/page.${n}.jpg`, status: 'in-progress', claimedBy: OWNER, claimedAt: new Date() })
  }
})

describe('OCR לספר אישי — מסלול הבעלים', () => {
  it('הבעלים שולח למחשב המקומי, רואה את העבודה, ועוצר אותה; הספר האישי נשאר כמו שהיה', async () => {
    asUser(OWNER)
    const res = await start(json('/api/user/books/ocr/start', { bookId: String(book._id), method: 'local', existingTextMode: 'skip', requestId: 'req-owner-flow-000001' }))
    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ success: true, status: 'queued', totalPages: 2 })
    const job = await OcrJob.findOne({ book: book._id }).lean()
    expect(String(job.startedBy)).toBe(OWNER)

    const st = await status(get(`/api/user/books/ocr/status?bookId=${book._id}`))
    expect(st.status).toBe(200)
    expect(st.headers.get('cache-control')).toBe('private, no-store')
    expect((await st.json()).job).toMatchObject({ id: String(job._id), status: 'queued', method: 'local' })

    // מנהל ספרים רואה את אותה עבודה במסך הניהול, כרגיל
    asUser('507f1f77bcf86cd799439011', ['admin_books'])
    expect((await (await adminStatus(get(`/api/admin/books/ocr/status?bookId=${book._id}`))).json()).job.id).toBe(String(job._id))

    asUser(OWNER)
    expect((await cancel(json('/api/user/books/ocr/cancel', { jobId: String(job._id) }))).status).toBe(200)
    expect(await OcrJob.findById(job._id).lean()).toMatchObject({ status: 'cancelled', cancelReason: 'owner' })

    const after = await Book.findById(book._id).lean()
    expect(after).toMatchObject({ isHidden: true, isPrivate: true })
    expect(String(after.ownerId)).toBe(OWNER)
    const pages = await Page.find({ book: book._id }).lean()
    expect(pages.map((p) => [p.status, String(p.claimedBy)])).toEqual([['in-progress', OWNER], ['in-progress', OWNER]])
  })

  it('משתמש אחר עם אותו תפקיד — לא רואה, לא מפעיל ולא עוצר', async () => {
    asUser(OWNER)
    await start(json('/api/user/books/ocr/start', { bookId: String(book._id), method: 'local', existingTextMode: 'skip', requestId: 'req-owner-flow-000002' }))
    const job = await OcrJob.findOne({ book: book._id }).lean()

    asUser(OTHER)
    expect((await status(get(`/api/user/books/ocr/status?bookId=${book._id}`))).status).toBe(404)
    expect((await start(json('/api/user/books/ocr/start', { bookId: String(book._id), method: 'local', existingTextMode: 'skip', requestId: 'req-owner-flow-000003' }))).status).toBe(404)
    expect((await cancel(json('/api/user/books/ocr/cancel', { jobId: String(job._id) }))).status).toBe(404)
    expect((await OcrJob.findById(job._id).lean()).status).toBe('queued')
    expect(await OcrJob.countDocuments()).toBe(1)
  })

  it('דילוג על עריכה ידנית סופר ובוחר עמודים אישיים שכבר נתפסו אוטומטית', async () => {
    asUser(OWNER)
    await Page.updateOne({ book: book._id, pageNumber: 2 }, { $set: { content: 'עריכה ידנית', contentSaveRevision: 1 } })
    const before = await status(get(`/api/user/books/ocr/status?bookId=${book._id}`))
    expect((await before.json()).counts.toProcess.skip_edited).toBe(1)

    const res = await start(json('/api/user/books/ocr/start', {
      bookId: String(book._id), method: 'local', existingTextMode: 'skip_edited', requestId: 'req-owner-skip-edited',
    }))
    expect(res.status).toBe(202)
    expect((await OcrJob.findOne({ book: book._id }).lean()).pageMap.map((page) => page.pageNumber)).toEqual([1])
  })

  it('אחרי פרסום הספר, הבעלים הקודם לא יכול להפעיל או לשלוט בעבודה', async () => {
    asUser(OWNER)
    const payload = { bookId: String(book._id), method: 'local', existingTextMode: 'skip', requestId: 'req-owner-before-publish' }
    const accepted = await start(json('/api/user/books/ocr/start', payload))
    expect(accepted.status).toBe(202)
    const { jobId } = await accepted.json()

    await Book.updateOne({ _id: book._id }, {
      $set: { isPrivate: false, isHidden: false },
      $unset: { ownerId: 1 },
    })
    expect((await start(json('/api/user/books/ocr/start', payload))).status).toBe(404)
    expect((await status(get(`/api/user/books/ocr/status?bookId=${book._id}`))).status).toBe(404)
    expect((await cancel(json('/api/user/books/ocr/cancel', { jobId }))).status).toBe(404)
  })

  it('עבודת אימון נשארת מחוץ ללוח ומוגנת מביטול בדפדפן', async () => {
    const training = await OcrJob.create({ book: book._id, method: 'local', taskType: 'training', status: 'queued', active: true })
    const request = json('/api/user/books/ocr/cancel', { jobId: String(training._id) })

    asUser(OWNER)
    expect((await (await status(get(`/api/user/books/ocr/status?bookId=${book._id}`))).json()).job).toBeNull()
    expect((await cancel(request)).status).toBe(404)
    asUser(OTHER, ['admin_books'])
    expect((await (await adminStatus(get(`/api/admin/books/ocr/status?bookId=${book._id}`))).json()).job).toBeNull()
    expect((await adminCancel(json('/api/admin/books/ocr/cancel', { jobId: String(training._id) }))).status).toBe(409)
    expect((await OcrJob.findById(training._id).lean()).status).toBe('queued')
  })

  it('טקסט OCR מספר אישי נשאר מחוץ לחיפוש הפומבי ולעמודי הדוגמה של אורח', async () => {
    const term = 'sharedsearchterm'
    await Page.collection.createIndex({ content: 'text' }, { default_language: 'none' })
    await Book.updateOne({ _id: book._id }, { $set: { examplePage: 1 } })
    await Page.updateMany({ book: book._id }, { $set: { content: `${term} `.repeat(20) } })
    await Page.insertMany(Array.from({ length: 55 }, (_, index) => ({
      book: book._id,
      pageNumber: index + 3,
      imagePath: '/placeholder.jpg',
      content: `${term} `.repeat(20),
    })))
    const publicBook = await Book.create({ name: 'ספר גלוי', slug: 'public-sefer' })
    await Page.create({ book: publicBook._id, pageNumber: 1, imagePath: '/placeholder.jpg', content: `${term} public page` })

    asUser(OTHER, [])
    const results = await (await search(get(`/api/search?q=${term}`))).json()
    expect(results).toMatchObject({ success: true, results: [{ bookSlug: publicBook.slug }] })
    expect(results.results).toHaveLength(1)

    const context = { params: Promise.resolve({ id: book.slug }) }
    getServerSessionMock.mockResolvedValue(null)
    expect((await example(get('/example'), context)).status).toBe(404)
    asUser(OWNER)
    const ownedExample = await example(get('/example'), context)
    expect(ownedExample.headers.get('cache-control')).toBe('private, no-store')
    expect((await ownedExample.json()).text.content).toContain(term)
  })

  it('הבעלים בלי התפקיד — 403, ושום עבודה לא נוצרת', async () => {
    asUser(OWNER, [])
    expect((await start(json('/api/user/books/ocr/start', { bookId: String(book._id), method: 'local', existingTextMode: 'skip', requestId: 'req-owner-flow-000004' }))).status).toBe(403)
    expect(await OcrJob.countDocuments()).toBe(0)
  })
})
