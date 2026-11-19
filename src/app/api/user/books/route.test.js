// @vitest-environment node
// בדיקות עם MongoDB זמני: הספר הפרטי אינו מוסתר כדי לוודא שההגנה אינה תלויה ב-isHidden.
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/lib/api-cache', () => ({ cached: async (_key, _ttl, fn) => fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => true }))
vi.mock('@/lib/client-ip', () => ({ getClientIp: () => '127.0.0.1' }))
import { getServerSession } from 'next-auth'
import Book from '@/models/Book'
import User from '@/models/User'
import Page from '@/models/Page'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { GET as ownList } from './route'
import { GET as tree } from '@/app/api/library/route'
import { GET as catalog } from '@/app/api/library/list/route'
import { GET as search } from '@/app/api/search/route'
import { GET as stats } from '@/app/api/stats/route'
import { GET as weekly } from '@/app/api/stats/weekly-progress/route'
import { GET as example } from '@/app/api/book/[id]/example/route'
import { POST as complete } from '@/app/api/book/complete-page/route'
import { GET as editorPage } from '@/app/api/book/[id]/editor/route'
import { GET as bookPage } from '@/app/api/book/[id]/route'
import { GET as content } from '@/app/api/page-content/route'
import { GET as ocrData } from '@/app/api/page-content/ocr-data/route'
import { GET as layout } from '@/app/api/page-layout/route'
import { GET as trainingBooks } from '@/app/api/admin/ocr-training/books/route'
import { publicPagesStages } from '@/lib/privateBooks'

vi.setConfig({ testTimeout: 30000 })
let db, privateBook, privatePage, publicBook
const OWNER = '507f1f77bcf86cd799439099'
const setUser = (role = 'private_ocr', id = OWNER) => getServerSession.mockResolvedValue({ user: { id, _id: id, role } })
const req = path => new Request(`http://localhost${path}`)
const params = id => ({ params: Promise.resolve({ id }) })
beforeAll(async () => {
  vi.stubEnv('MONGOMS_RUNTIME_DOWNLOAD', 'false')
  db = await startMongo()
  if (!db.skip) await Page.collection.createIndex({ content: 'text' })
}, 120000)
afterAll(async () => { if (db && !db.skip) await db.stop(); vi.unstubAllEnvs() })
beforeEach(async ctx => {
  if (db.skip) return ctx.skip()
  await db.reset()
  setUser()
  // מסמך קיים ללא השדות החדשים חייב להישאר ציבורי.
  const legacy = await Book.collection.insertOne({ name: 'ציבורי', slug: 'public', totalPages: 1 })
  publicBook = await Book.findById(legacy.insertedId)
  privateBook = await Book.create({ name: 'פרטי סודי', slug: 'secret', totalPages: 1, isPrivate: true, privateOcr: true, ownerId: OWNER, isHidden: false, examplePage: 1 })
  for (const b of [publicBook, privateBook]) {
    const p = await Page.create({ book: b._id, pageNumber: 1, content: 'מילתבדיקה', imagePath: '/x.jpg', status: 'completed', completedAt: new Date() })
    if (b === privateBook) privatePage = p
  }
})

it('רשימת הבעלים בלבד, גם כשנשלח מזהה משתמש מזויף', async () => {
  const res = await ownList(req('/api/user/books?userId=other'))
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect((await res.json()).books.map(b => b.name)).toEqual(['פרטי סודי'])
  setUser('private_ocr', '507f1f77bcf86cd799439098')
  expect((await (await ownList()).json()).books).toEqual([])
  setUser('user')
  const legacy = await Book.create({ name: 'ספר אישי קיים', slug: 'personal', isPrivate: true, isHidden: true, ownerId: OWNER })
  const resWithLegacy = await ownList()
  expect(resWithLegacy.status).toBe(200)
  expect((await resWithLegacy.json()).books).toMatchObject([{ id: String(legacy._id), privateOcr: false }])
  expect((await bookPage(req('/api/book/personal'), params('personal'))).status).toBe(200)
})
it('אין ספר פרטי בעץ, בקטלוג, בחיפוש, בספירות או בהספק השבועי', async () => {
  expect(JSON.stringify(await (await tree()).json())).not.toContain('פרטי סודי')
  expect((await (await catalog(req('/api/library/list'))).json()).books.map(b => b.name)).toEqual(['ציבורי'])
  const results = (await (await search(req('/api/search?q=מילתבדיקה'))).json()).results
  expect(results.map(r => r.bookName)).toEqual(['ציבורי'])
  const counts = (await (await stats()).json()).stats
  expect(counts.books.total).toBe(1)
  expect(counts.completedPages).toBe(1)
  expect((await (await weekly()).json()).total).toBe(1)
  const grouped = await Page.aggregate([...publicPagesStages(), { $count: 'count' }])
  expect(grouped).toEqual([{ count: 1 }])
})
it('שליפה ישירה, דוגמה ועורך לפי מזהה עמוד מחזירים 404 גם לבעלים דרך הנתיבים הרגילים', async () => {
  for (const id of [OWNER, '507f1f77bcf86cd799439098']) {
    setUser('private_ocr', id)
    expect((await bookPage(req('/api/book/secret'), params('secret'))).status).toBe(404)
    expect((await editorPage(req('/api/book/secret/editor?page=1'), params('secret'))).status).toBe(404)
    expect((await example(req('/api/book/secret/example'), params('secret'))).status).toBe(404)
    expect((await content(req('/api/page-content?bookPath=secret&pageNumber=1'))).status).toBe(404)
    expect((await ocrData(req(`/api/page-content/ocr-data?pageId=${privatePage._id}`))).status).toBe(404)
    expect((await layout(req(`/api/page-layout?pageId=${privatePage._id}`))).status).toBe(404)
  }
})
it('מנהלי ספרייה ממשיכים לראות ספרים פרטיים ולפתוח את עמודיהם', async () => {
  setUser('admin')
  expect((await (await catalog(req('/api/library/list'))).json()).books).toHaveLength(2)
  expect((await bookPage(req('/api/book/secret'), params('secret'))).status).toBe(200)
  expect((await example(req('/api/book/secret/example'), params('secret'))).status).toBe(200)
  expect((await content(req('/api/page-content?bookPath=secret&pageNumber=1'))).status).toBe(200)
  // גם מנהל אינו מעביר ספר פרטי לתור האימון הציבורי.
  expect(JSON.stringify(await (await trainingBooks()).json())).not.toContain('פרטי סודי')
  expect(await Book.countDocuments()).toBe(2)
})


it('השלמת ספר אישי ותיק מפרסמת אותו וספר OCR פרטי נשאר אישי', async () => {
  await User.create({ _id: OWNER, name: 'בעל ספר', email: 'owner@example.test' })
  const oldBook = await Book.create({ name: 'ספר אישי ותיק', slug: 'old-book', totalPages: 1, isPrivate: true, isHidden: true, ownerId: OWNER })
  const oldPage = await Page.create({ book: oldBook._id, pageNumber: 1, status: 'in-progress', claimedBy: OWNER })
  const finish = pageId => complete(new Request('http://localhost/api/book/complete-page', {
    method: 'POST', body: JSON.stringify({ pageId }),
  }))

  setUser('user')
  expect((await finish(oldPage._id)).status).toBe(200)
  expect(await Book.findById(oldBook._id).lean()).toMatchObject({ isPrivate: false, isHidden: false, completedPages: 1 })

  await Page.updateOne({ _id: privatePage._id }, { $set: { status: 'in-progress', claimedBy: OWNER } })
  await Book.updateOne({ _id: privateBook._id }, { $set: { isHidden: true } })
  setUser('admin')
  expect((await finish(privatePage._id)).status).toBe(200)
  expect(await Book.findById(privateBook._id).lean()).toMatchObject({ privateOcr: true, isPrivate: true, isHidden: true, completedPages: 1 })
})
