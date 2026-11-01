// @vitest-environment node
// GET/PUT /api/page-layout מול MongoDB אמיתי (mongodb-memory-server) ותמונות JPEG אמיתיות בתיקייה
// זמנית — באותו דפוס כמו page-content/ocr-data/route.test.js. בלי בינארי Mongo — מדולג.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

const env = await vi.hoisted(async () => {
  const os = await import('node:os')
  const path = await import('node:path')
  const fs = await import('node:fs')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'page-layout-'))
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
import mongoose from 'mongoose'
import sharp from 'sharp'
import Book from '@/models/Book'
import Page from '@/models/Page'
import PageLayout from '@/models/PageLayout'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { imageInspectCache } from '@/lib/ocr/ocrPageData'
import { GET, PUT } from './route'

vi.setConfig({ testTimeout: 60000 })

const USER = { user: { id: '507f1f77bcf86cd799439011', _id: '507f1f77bcf86cd799439011', role: 'user' } }
const OTHER = { user: { id: '507f1f77bcf86cd799439013', _id: '507f1f77bcf86cd799439013', role: 'user' } }
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
  imageInspectCache.clear?.()
  getServerSessionMock.mockResolvedValue(USER)
})

const jpeg = (w, h, r) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g: 40, b: 90 } } }).jpeg({ quality: 85 }).toBuffer()

let seq = 0
async function setup(pageExtra = {}) {
  const slug = `pl${++seq}`
  const book = await Book.create({ name: `ספר ${slug}`, slug })
  const dir = path.join(env.uploads, 'books', slug)
  await fs.mkdir(dir, { recursive: true })
  const imageFile = path.join(dir, 'page.1.jpg')
  await fs.writeFile(imageFile, await jpeg(60, 80, 10))
  // ברירת מחדל: העמוד תפוס על ידי USER (כתיבת תיבות דורשת תפיסה — canWritePageLayout)
  const page = await Page.create({ book: book._id, pageNumber: 1, imagePath: `/uploads/books/${slug}/page.1.jpg`, status: 'in-progress', claimedBy: new mongoose.Types.ObjectId(USER.user.id), ...pageExtra })
  return { book, page, slug, imageFile }
}

const layout = (extra = {}) => ({
  source: 'local-tesseract',
  size: [60, 80],
  lines: [{ bbox: [5, 5, 55, 15], words: [{ bbox: [30, 5, 55, 15], text: 'שלום', conf: 0.9 }, { bbox: [5, 5, 25, 15] }] }],
  ...extra,
})

const get = async (query) => {
  const res = await GET(new Request(`http://localhost/api/page-layout?${new URLSearchParams(query)}`))
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
}
const put = async (body) => {
  const res = await PUT(new Request('http://localhost/api/page-layout', { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) }))
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
}

describe('/api/page-layout', () => {
  it('401 בלי session, 400 בלי מזהה / מזהה פגום, 404 לעמוד חסר — תמיד private, no-store', async () => {
    getServerSessionMock.mockResolvedValue(null)
    expect([(await get({ pageId: String(new mongoose.Types.ObjectId()) })).status, (await put(layout())).status]).toEqual([401, 401])
    getServerSessionMock.mockResolvedValue(USER)
    const b = await get({})
    expect([b.status, b.body.error, b.cache]).toEqual([400, 'חסר מזהה עמוד או נתיב ספר ומספר עמוד', 'private, no-store'])
    expect((await get({ pageId: 'zzz' })).body.error).toBe('מזהה עמוד לא תקין')
    expect((await get({ bookPath: '%E0%A4', pageNumber: '1' })).body.error).toBe('נתיב ספר לא תקין')
    const nf = await get({ pageId: String(new mongoose.Types.ObjectId()) })
    expect([nf.status, nf.body.error, nf.cache]).toEqual([404, 'העמוד לא נמצא', 'private, no-store'])
    expect((await put({ ...layout() })).body.error).toBe('חסר מזהה עמוד או נתיב ספר ומספר עמוד')
    expect((await put('{bad')).body.error).toBe('גוף הבקשה אינו JSON תקין')
  })

  it('GET בלי רשומה אינו קורא את התמונה; inspectImage טוען snapshot רק לפני זיהוי', async () => {
    const { page, slug } = await setup()
    const empty = await get({ pageId: String(page._id) })
    expect(empty.status).toBe(200)
    expect(empty.cache).toBe('private, no-store')
    expect(empty.body.data).toMatchObject({ pageId: String(page._id), pageNumber: 1, version: 0, stale: false, layout: null, image: { sha256: null, width: null, height: null, matches: null } })

    const snapshot = await get({ pageId: String(page._id), inspectImage: '1' })
    expect(snapshot.body.data.image).toMatchObject({ width: 60, height: 80, matches: null })
    expect(snapshot.body.data.image.sha256).toMatch(/^[0-9a-f]{64}$/)

    const saved = await put({ pageId: String(page._id), ...layout() })
    expect([saved.status, saved.cache]).toEqual([200, 'private, no-store'])
    expect(saved.body.data).toMatchObject({ version: 1, wordCount: 2 })

    const r = await get({ bookPath: slug, pageNumber: '1' })
    expect(r.body.data.version).toBe(1)
    expect(r.body.data.image.matches).toBe(true)
    expect(r.body.data.layout).toMatchObject({ source: 'local-tesseract', size: [60, 80], wordCount: 2, version: 1 })
    expect(r.body.data.layout.lines[0]).toEqual({ bbox: [5, 5, 55, 15], stream: 'main', words: [{ bbox: [30, 5, 55, 15], text: 'שלום', conf: 0.9 }, { bbox: [5, 5, 25, 15] }] })
    const doc = await PageLayout.findOne({ page: page._id }).lean()
    expect(String(doc.createdBy)).toBe(USER.user.id)
    expect(doc.imageSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ולידציה: ממדים שלא תואמים לתמונה, תיבה מחוץ לגבולות, מקור לא מוכר — 400 בעברית', async () => {
    const { page } = await setup()
    const pageId = String(page._id)
    expect((await put({ pageId, ...layout({ size: [80, 60] }) })).body.error).toMatch(/אינם תואמים לתמונת העמוד/)
    expect((await put({ pageId, ...layout({ lines: [{ bbox: [0, 0, 70, 10] }] }) })).body.error).toBe('שורה 1: התיבה חורגת מגבולות התמונה')
    const bad = await put({ pageId, ...layout({ source: 'gemini' }) })
    expect([bad.status, bad.body.error]).toEqual([400, 'מקור התיבות אינו תקין'])
    expect((await put({ pageId, expectedVersion: -2, ...layout() })).body.error).toBe('גרסה צפויה לא תקינה')
    expect(await PageLayout.countDocuments()).toBe(0)
  })

  it('413 לגוף גדול מדי', async () => {
    const { page } = await setup()
    const r = await put({ pageId: String(page._id), ...layout(), pad: 'x'.repeat(1024 * 1024 + 10) })
    expect([r.status, r.body.error]).toEqual([413, 'גוף הבקשה גדול מדי'])
  })

  it('413 גם לגוף chunked בלי content-length — הקריאה נעצרת במגבלה', async () => {
    const { page } = await setup()
    let pulled = 0
    const chunk = new TextEncoder().encode('x'.repeat(64 * 1024))
    const body = new ReadableStream({
      pull(ctrl) {
        pulled++
        if (pulled === 1) ctrl.enqueue(new TextEncoder().encode(`{"pageId":"${page._id}","pad":"`))
        else if (pulled < 200) ctrl.enqueue(chunk)
        else ctrl.close()
      },
    })
    const res = await PUT(new Request('http://localhost/api/page-layout', { method: 'PUT', body, duplex: 'half' }))
    expect(res.status).toBe(413)
    expect(pulled).toBeLessThan(40) // לא נקרא עד הסוף (~12MB)
  })

  it('PUT לעמוד פנוי (לא תפוס) — 403 בעברית; GET מותר; מנהל ספרים — מותר', async () => {
    const { page } = await setup({ status: 'available', claimedBy: null })
    const pageId = String(page._id)
    expect((await get({ pageId })).status).toBe(200)
    const r = await put({ pageId, ...layout() })
    expect([r.status, r.body.error, r.cache]).toEqual([403, 'כדי לשמור תיבות לעמוד יש לתפוס אותו קודם', 'private, no-store'])
    getServerSessionMock.mockResolvedValue(ADMIN)
    expect((await put({ pageId, ...layout() })).status).toBe(200)
  })

  it('expectedVersion: 0 רק כשאין רשומה, n רק כשהגרסה תואמת — אחרת 409', async () => {
    const { page } = await setup()
    const pageId = String(page._id)
    expect((await put({ pageId, expectedVersion: 0, ...layout() })).body.data.version).toBe(1)
    const dup = await put({ pageId, expectedVersion: 0, ...layout() })
    expect([dup.status, dup.body.error]).toEqual([409, 'התיבות של העמוד עודכנו בינתיים — טען את העמוד מחדש ונסה שוב'])
    expect((await put({ pageId, expectedVersion: 1, ...layout() })).body.data.version).toBe(2)
    expect((await put({ pageId, expectedVersion: 1, ...layout() })).status).toBe(409)
    expect((await put({ pageId, ...layout() })).body.data.version).toBe(3)
    expect(await PageLayout.countDocuments()).toBe(1)
  })

  it('תמונה שהוחלפה → stale:true ו-layout:null; שמירה חדשה מתקנת', async () => {
    const { page, imageFile } = await setup()
    const pageId = String(page._id)
    await put({ pageId, ...layout() })
    await fs.writeFile(imageFile, await jpeg(60, 80, 200))
    const r = await get({ pageId })
    expect(r.body.data).toMatchObject({ stale: true, layout: null, version: 1, image: { matches: false } })
    await put({ pageId, expectedVersion: 1, ...layout() })
    expect((await get({ pageId })).body.data).toMatchObject({ stale: false, version: 2 })
  })

  it('imageSha256 מהלקוח: תמונה שהוחלפה מאז ה-GET → 409; hash תואם → נשמר; hash פגום → 400 (QA P2-12)', async () => {
    const { page, imageFile } = await setup()
    const pageId = String(page._id)
    const first = await get({ pageId, inspectImage: '1' })
    const sha = first.body.data.image.sha256
    expect(sha).toMatch(/^[0-9a-f]{64}$/)
    expect((await put({ pageId, expectedVersion: 0, imageSha256: sha, ...layout() })).status).toBe(200)
    await fs.writeFile(imageFile, await jpeg(60, 80, 200))
    imageInspectCache.clear?.()
    const r = await put({ pageId, expectedVersion: 1, imageSha256: sha, ...layout() })
    expect([r.status, r.body.error, r.body.code, r.cache]).toEqual([409, 'תמונת העמוד הוחלפה מאז שהתיבות חושבו — טען את העמוד מחדש ונסה שוב', 'image-changed', 'private, no-store'])
    expect((await put({ pageId, expectedVersion: 1, imageSha256: 'xyz', ...layout() })).status).toBe(400)
    expect(await PageLayout.findOne({ page: page._id }).lean()).toMatchObject({ version: 1, imageSha256: sha })
  })

  it('רשומה בלי hash (השרת לא הצליח לחשב) — לא נחשבת טרייה: stale:true, verified:false, layout:null', async () => {
    const { page } = await setup()
    const pageId = String(page._id)
    await put({ pageId, ...layout() })
    await PageLayout.updateOne({ page: page._id }, { $set: { imageSha256: null } })
    const r = await get({ pageId })
    expect(r.body.data).toMatchObject({ stale: true, verified: false, layout: null, version: 1 })
    // שמירה מחדש כשהתמונה כן ניתנת לחישוב — מאומתת
    await put({ pageId, expectedVersion: 1, ...layout() })
    expect((await get({ pageId })).body.data).toMatchObject({ stale: false, verified: true, version: 2 })
  })

  it('403 לעמוד בטיפול של משתמש אחר (כמו page-content); בעלים ומנהל ספרים — מותר', async () => {
    const { page } = await setup()
    const pageId = String(page._id)
    expect((await put({ pageId, ...layout() })).status).toBe(200)
    getServerSessionMock.mockResolvedValue(OTHER)
    const g = await get({ pageId })
    expect([g.status, g.body.error, g.cache]).toEqual([403, 'הדף נמצא בטיפול על ידי משתמש אחר', 'private, no-store'])
    expect((await put({ pageId, ...layout() })).status).toBe(403)
    getServerSessionMock.mockResolvedValue(ADMIN)
    expect((await get({ pageId })).status).toBe(200)
    expect((await put({ pageId, ...layout() })).body.data.version).toBe(2)
  })

  it('מאמת בעלות שוב לאחר בדיקת התמונה — העברה באמצע PUT מבטלת את הכתיבה', async () => {
    const { page } = await setup()
    const originalFindById = Page.findById.bind(Page)
    let reads = 0
    const spy = vi.spyOn(Page, 'findById').mockImplementation((...args) => {
      reads++
      if (reads !== 2) return originalFindById(...args)
      const transferred = { ...page.toObject(), claimedBy: new mongoose.Types.ObjectId(OTHER.user.id) }
      return {
        select() { return this },
        lean: async () => transferred,
      }
    })
    try {
      const r = await put({ pageId: String(page._id), ...layout() })
      expect([r.status, r.body.error]).toEqual([403, 'הדף נמצא בטיפול על ידי משתמש אחר'])
      expect(await PageLayout.countDocuments()).toBe(0)
      expect(reads).toBe(2)
    } finally {
      spy.mockRestore()
    }
  })
})
