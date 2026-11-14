// @vitest-environment node
// API התנגשויות OCR מקומי (רשימה + אימוץ/דחייה) — מול MongoDB אמיתי (mongodb-memory-server).
// בלי בינארי Mongo — הבדיקות מדולגות. מכסה: 401/403, רשימה ממוינת עם הטקסט הנוכחי של העמוד,
// אימוץ מותנה ב-updatedAt (עריכה חדשה יותר לא נדרסת → 409), דחייה, טיפול כפול ועמוד שנמחק.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import mongoose from 'mongoose'
import Book from '@/models/Book'
import Page from '@/models/Page'
import OcrJob from '@/models/OcrJob'
import OcrConflict from '@/models/OcrConflict'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { GET } from './route'
import { POST } from './[id]/route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const session = { user: { id: '507f1f77bcf86cd799439099', name: 'מנהל ספרים', role: 'admin_books' } }
const SHA = 'c'.repeat(64)

let book
let job
let pages

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  getServerSessionMock.mockReset()
  getServerSessionMock.mockResolvedValue(session)
  book = await Book.create({ name: 'ספר בדיקה', slug: `b-${Date.now()}` })
  job = await OcrJob.create({ book: book._id, method: 'local', status: 'completed', active: false })
  pages = []
  for (const n of [5, 2, 9]) {
    pages.push(await Page.create({ book: book._id, pageNumber: n, imagePath: `/x/${n}.jpg`, content: `טקסט אנושי ${n}` }))
  }
  for (const p of pages) {
    await OcrConflict.create({
      job: job._id,
      book: book._id,
      page: p._id,
      pageNumber: p.pageNumber,
      ocrText: `טקסט OCR ${p.pageNumber}`,
      resultSha256: SHA,
      expectedUpdatedAt: new Date(p.updatedAt.getTime() - 1000),
      foundUpdatedAt: p.updatedAt,
    })
  }
})

const listReq = (qs) => new Request(`http://localhost/api/admin/books/ocr/conflicts?${qs}`)
const actionReq = (body) => new Request('http://localhost/api/admin/books/ocr/conflicts/x', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const act = async (id, body) => {
  const res = await POST(actionReq(body), { params: Promise.resolve({ id: String(id) }) })
  return { res, body: await res.json() }
}
const conflictOf = (page) => OcrConflict.findOne({ page: page._id }).lean()

afterEach(() => vi.restoreAllMocks())

describe('הרשאות', () => {
  it('401 בלי session, 403 בלי הרשאת ספרייה — ברשימה ובפעולה', async () => {
    getServerSessionMock.mockResolvedValue(null)
    expect((await GET(listReq(`jobId=${job._id}`))).status).toBe(401)
    const c = await conflictOf(pages[0])
    expect((await act(c._id, { action: 'dismiss' })).res.status).toBe(401)

    getServerSessionMock.mockResolvedValue({ user: { role: 'user', name: 'x' } })
    expect((await GET(listReq(`jobId=${job._id}`))).status).toBe(403)
    expect((await act(c._id, { action: 'dismiss' })).res.status).toBe(403)
    expect((await conflictOf(pages[0])).status).toBe('open')
  })
})

describe('GET רשימה', () => {
  it('cursor pagination does not skip the next conflict when another admin resolves an earlier row', async () => {
    const first = await (await GET(listReq(`bookId=${book._id}&status=open&limit=2`))).json()
    expect(first.conflicts.map((c) => c.pageNumber)).toEqual([2, 5])
    expect(first.hasMore).toBe(true)
    await OcrConflict.updateOne({ _id: first.conflicts[0].id }, { $set: { status: 'dismissed' } })
    const next = await (await GET(listReq(`bookId=${book._id}&status=open&limit=2&after=${encodeURIComponent(first.nextCursor)}`))).json()
    expect(next.conflicts.map((c) => c.pageNumber)).toEqual([9])
    expect(next.hasMore).toBe(false)
  })

  it('cursor breaks ties by id even when the anchor itself was resolved', async () => {
    await OcrConflict.updateMany({}, { $set: { pageNumber: 5 } })
    const first = await (await GET(listReq(`bookId=${book._id}&status=open&limit=1`))).json()
    await OcrConflict.updateOne({ _id: first.conflicts[0].id }, { $set: { status: 'dismissed' } })
    const next = await (await GET(listReq(`bookId=${book._id}&status=open&limit=2&after=${encodeURIComponent(first.nextCursor)}`))).json()
    expect(next.conflicts).toHaveLength(2)
    expect(next.conflicts.every((c) => c.id > first.conflicts[0].id)).toBe(true)
    expect(next.hasMore).toBe(false)
  })

  it('invalid cursors are rejected', async () => {
    for (const cursor of ['no-json', '{}', '{"pageNumber":1,"id":"nope"}', '{"pageNumber":1,"id":["507f1f77bcf86cd799439050"]}']) {
      expect((await GET(listReq(`bookId=${book._id}&after=${encodeURIComponent(cursor)}`))).status).toBe(400)
    }
  })

  it('ממוינת לפי מספר עמוד, עם הטקסט הנוכחי של העמוד ו-updatedAt שלו', async () => {
    const res = await GET(listReq(`jobId=${job._id}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const body = await res.json()
    expect(body.total).toBe(3)
    expect(body.openCount).toBe(3)
    expect(body.hasMore).toBe(false)
    expect(body.conflicts.map((c) => c.pageNumber)).toEqual([2, 5, 9])
    const p2 = pages.find((p) => p.pageNumber === 2)
    expect(body.conflicts[0]).toMatchObject({
      pageNumber: 2,
      status: 'open',
      ocrText: 'טקסט OCR 2',
      pageContent: 'טקסט אנושי 2',
      pageExists: true,
      pageUpdatedAt: p2.updatedAt.toISOString(),
    })
  })

  it('לפי ספר, סינון לפי מצב ודפדוף', async () => {
    const page1 = await (await GET(listReq(`bookId=${book._id}&limit=2`))).json()
    expect(page1.conflicts).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    const page2 = await (await GET(listReq(`bookId=${book._id}&limit=2&offset=2`))).json()
    expect(page2.conflicts.map((c) => c.pageNumber)).toEqual([9])

    await OcrConflict.updateOne({ page: pages[0]._id }, { $set: { status: 'dismissed' } })
    const open = await (await GET(listReq(`jobId=${job._id}&status=open`))).json()
    expect(open.total).toBe(2)
  })

  it('400 על מזהה חסר/לא תקין', async () => {
    expect((await GET(listReq(''))).status).toBe(400)
    expect((await GET(listReq('jobId=nope'))).status).toBe(400)
    expect((await GET(listReq(`jobId=${job._id}&status=weird`))).status).toBe(400)
  })
})

describe('POST פעולה', () => {
  it('אימוץ OCR עם updatedAt נוכחי — העמוד מתעדכן וההתנגשות applied', async () => {
    const page = pages[0]
    const c = await conflictOf(page)
    const { res, body } = await act(c._id, { action: 'apply', expectedPageUpdatedAt: page.updatedAt.toISOString() })
    expect(res.status).toBe(200)
    expect(body.conflict).toMatchObject({ status: 'applied', resolvedByName: 'מנהל ספרים', pageContent: 'טקסט OCR 5' })

    const after = await Page.findById(page._id).lean()
    expect(after.content).toBe('טקסט OCR 5')
    expect(String(after.lastOcrJobId)).toBe(String(job._id))
    expect(after.lastOcrResultSha256).toBe(SHA)
    expect((await conflictOf(page)).status).toBe('applied')
  })

  it('אימוץ עם updatedAt ישן (העמוד נערך שוב) → 409, ושום דבר לא נדרס', async () => {
    const page = pages[0]
    const c = await conflictOf(page)
    const stale = page.updatedAt.toISOString()
    await new Promise((r) => setTimeout(r, 5))
    await Page.updateOne({ _id: page._id }, { $set: { content: 'עריכה חדשה יותר' } })

    const { res, body } = await act(c._id, { action: 'apply', expectedPageUpdatedAt: stale })
    expect(res.status).toBe(409)
    expect(body.code).toBe('page_changed')
    expect(body.error).toBe('העמוד השתנה שוב — רעננו')
    expect((await Page.findById(page._id).lean()).content).toBe('עריכה חדשה יותר')
    expect((await conflictOf(page)).status).toBe('open')
  })

  it('דחייה — הטקסט הקיים נשאר; טיפול חוזר → 409 already_resolved', async () => {
    const page = pages[1]
    const c = await conflictOf(page)
    const first = await act(c._id, { action: 'dismiss' })
    expect(first.res.status).toBe(200)
    expect(first.body.conflict.status).toBe('dismissed')
    expect((await Page.findById(page._id).lean()).content).toBe('טקסט אנושי 2')

    const again = await act(c._id, { action: 'apply', expectedPageUpdatedAt: page.updatedAt.toISOString() })
    expect(again.res.status).toBe(409)
    expect(again.body.code).toBe('already_resolved')
    expect((await Page.findById(page._id).lean()).content).toBe('טקסט אנושי 2')
  })

  it('עמוד שנמחק → 404 בלי שינוי בהתנגשות', async () => {
    const page = pages[2]
    const c = await conflictOf(page)
    await Page.deleteOne({ _id: page._id })
    const { res } = await act(c._id, { action: 'apply', expectedPageUpdatedAt: page.updatedAt.toISOString() })
    expect(res.status).toBe(404)
    expect((await conflictOf(page)).status).toBe('open')
  })

  it('400: פעולה לא חוקית, אימוץ בלי מועד, מזהה לא תקין; 404 להתנגשות לא קיימת', async () => {
    const c = await conflictOf(pages[0])
    expect((await act(c._id, { action: 'delete' })).res.status).toBe(400)
    expect((await act(c._id, { action: 'apply' })).res.status).toBe(400)
    expect((await act(c._id, { action: 'apply', expectedPageUpdatedAt: 'not-a-date' })).res.status).toBe(400)
    expect((await act('zzz', { action: 'dismiss' })).res.status).toBe(400)
    expect((await act(new mongoose.Types.ObjectId(), { action: 'dismiss' })).res.status).toBe(404)
  })
})

describe('מרוץ אימוץ מול דחייה (סקירה W05)', () => {
  it('אימוץ שנעצר לפני כתיבת העמוד: דחייה במקביל → 409 apply_in_progress; אחרי השחרור — applied והעמוד עם ה-OCR', async () => {
    const page = pages[0]
    const c = await conflictOf(page)
    let release
    const barrier = new Promise((r) => { release = r })
    let held = false
    const actualUpdate = Page.updateOne.bind(Page)
    vi.spyOn(Page, 'updateOne').mockImplementation(async (...args) => {
      held = true
      await barrier
      return actualUpdate(...args)
    })

    const applying = act(c._id, { action: 'apply', expectedPageUpdatedAt: page.updatedAt.toISOString() })
    await vi.waitFor(() => expect(held).toBe(true))

    const dismiss = await act(c._id, { action: 'dismiss' })
    expect(dismiss.res.status).toBe(409)
    expect(dismiss.body.code).toBe('apply_in_progress')

    // הרשימה מציגה את מצב הביניים וסופרת אותו כממתין
    const list = await (await GET(listReq(`jobId=${job._id}`))).json()
    expect(list.openCount).toBe(3)
    expect(list.conflicts.find((x) => x.id === String(c._id)).status).toBe('applying')

    release()
    const apply = await applying
    expect(apply.res.status).toBe(200)
    expect(apply.body.conflict).toMatchObject({ status: 'applied', pageContent: 'טקסט OCR 5' })
    expect((await conflictOf(page)).status).toBe('applied')
    expect((await Page.findById(page._id).lean()).content).toBe('טקסט OCR 5')
  })

  it('דחייה שקדמה לאימוץ — האימוץ נדחה ב-409 already_resolved והעמוד לא מוחלף', async () => {
    const page = pages[0]
    const c = await conflictOf(page)
    expect((await act(c._id, { action: 'dismiss' })).res.status).toBe(200)
    const apply = await act(c._id, { action: 'apply', expectedPageUpdatedAt: page.updatedAt.toISOString() })
    expect(apply.res.status).toBe(409)
    expect(apply.body.code).toBe('already_resolved')
    expect((await Page.findById(page._id).lean()).content).toBe('טקסט אנושי 5')
    expect((await conflictOf(page)).status).toBe('dismissed')
  })

  it('קריסה במצב הביניים: applying שה-lease שלו פג מוכרע בטעינת הרשימה לפי העמוד (לא נכתב → open)', async () => {
    const page = pages[0]
    const c = await conflictOf(page)
    const old = new Date(Date.now() - 10 * 60 * 1000)
    await OcrConflict.updateOne({ _id: c._id }, {
      $set: { status: 'applying', applyToken: 't', applyStartedAt: old, applyLeaseUntil: new Date(old.getTime() + 1000) },
    })
    const list = await (await GET(listReq(`jobId=${job._id}`))).json()
    expect(list.conflicts.find((x) => x.id === String(c._id)).status).toBe('open')
    expect((await Page.findById(page._id).lean()).content).toBe('טקסט אנושי 5')
    const dismiss = await act(c._id, { action: 'dismiss' })
    expect(dismiss.res.status).toBe(200)
    expect(dismiss.body.conflict.status).toBe('dismissed')
  })
})
