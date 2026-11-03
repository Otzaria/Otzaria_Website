// @vitest-environment node
// שמירת תוכן מול MongoDB אמיתי. בלי בינארי Mongo זמין הבדיקות מדולגות כמו יתר בדיקות הראוטים.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import mongoose from 'mongoose'
import Book from '@/models/Book'
import Page from '@/models/Page'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { POST } from './route'

vi.setConfig({ testTimeout: 60000 })

const USER_ID = '507f1f77bcf86cd799439011'
let db
let seq = 0

beforeAll(async () => {
  db = await startMongo()
}, 120000)

afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  getServerSessionMock.mockResolvedValue({ user: { id: USER_ID, _id: USER_ID, role: 'user' } })
})

async function setup() {
  const slug = `save-order-${++seq}`
  const book = await Book.create({ name: slug, slug })
  const page = await Page.create({
    book: book._id,
    pageNumber: 1,
    imagePath: `/uploads/books/${slug}/page.1.jpg`,
    status: 'in-progress',
    claimedBy: new mongoose.Types.ObjectId(USER_ID),
    content: 'מקורי',
  })
  return { slug, page }
}

async function save(slug, content, saveRevision) {
  const body = { bookPath: slug, pageNumber: 1, content, twoColumns: false, ...(saveRevision == null ? {} : { saveRevision }) }
  const response = await POST(new Request('http://localhost/api/page-content', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { status: response.status, body: await response.json() }
}

describe('POST /api/page-content save ordering', () => {
  it('בקשה ישנה שמסתיימת אחרי שמירה חדשה אינה דורסת את התוכן החדש', async () => {
    const { slug, page } = await setup()
    const newer = await save(slug, 'חדש', 1_800_000_000_002)
    const olderFinishingLate = await save(slug, 'ישן', 1_800_000_000_001)

    expect(newer).toMatchObject({ status: 200, body: { success: true } })
    expect(olderFinishingLate).toMatchObject({ status: 200, body: { success: true, stale: true } })
    const stored = await Page.findById(page._id).lean()
    expect(stored.content).toBe('חדש')
    expect(stored.contentSaveRevision).toBe(1_800_000_000_002)
  })

  it('revision לא תקין נדחה; לקוח ישן בלי revision נשאר נתמך', async () => {
    const { slug, page } = await setup()
    const invalid = await save(slug, 'לא יישמר', -1)
    expect(invalid).toMatchObject({ status: 400, body: { error: 'גרסת השמירה אינה תקינה' } })

    const legacy = await save(slug, 'לקוח ישן')
    expect(legacy).toMatchObject({ status: 200, body: { success: true } })
    expect((await Page.findById(page._id).lean()).content).toBe('לקוח ישן')
  })
})
