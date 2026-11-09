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
import { GET, POST } from './route'
import { ocrReviewRevision } from '@/lib/editor/ocrReviewState'
import { countBookOcrPages } from '@/lib/ocr/bookOcrCounts.js'
import { ocrTextSha256 } from '@/lib/ocr/runOcrJob.pure.js'

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

async function save(slug, content, saveRevision, extra = {}) {
  const body = { bookPath: slug, pageNumber: 1, content, twoColumns: false, ...(saveRevision == null ? {} : { saveRevision }), ...extra }
  const response = await POST(new Request('http://localhost/api/page-content', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { status: response.status, body: await response.json() }
}

describe('POST /api/page-content save ordering', () => {
  it.each([
    { content: '', revision: undefined, hash: true },
    { content: '', revision: 1, hash: true },
    { content: 'תיקון מהיר', revision: 1, hash: false },
    { content: '', revision: 1, hash: false },
  ])('שמירה אנושית בעמוד פנוי מוגנת מ-skip_edited: %j', async ({ content, revision, hash }) => {
    const { slug, page } = await setup()
    await Page.updateOne({ _id: page._id }, { $set: {
      status: 'available', lastOcrAt: new Date(Date.now() - 10000),
      ...(hash ? { lastOcrTextSha256: ocrTextSha256('מקורי') } : {}),
    } })
    expect(await save(slug, content, revision)).toMatchObject({ status: 200, body: { success: true } })
    const stored = await Page.findById(page._id).lean()
    expect(stored).toMatchObject({ content, status: 'available' })
    const counts = await countBookOcrPages(page.book)
    expect(counts.humanEditedPagesCount).toBe(1)
    expect(counts.toProcess.skip_edited).toBe(0)
    expect(counts.toProcess.overwrite).toBe(1)
  })

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

describe('persisted OCR word approvals', () => {
  const read = async (slug) => (await GET(new Request(`http://localhost/api/page-content?bookPath=${slug}&pageNumber=1`))).json()
  const decision = (revision) => ({ version: 1, revision, words: ['מקורי'], accepted: [0] })

  it('round-trips approvals without changing text; ordered saves and legacy clients preserve them', async () => {
    const { slug, page } = await setup()
    const loaded = await read(slug)
    expect(loaded.data.ocrWordReview).toBeNull()
    const state = decision(loaded.data.ocrReviewRevision)
    expect(await save(slug, 'מקורי', 20, { ocrWordReview: state })).toMatchObject({ status: 200 })
    expect((await read(slug)).data).toMatchObject({ content: 'מקורי', ocrWordReview: state })
    expect(await save(slug, 'מקורי', 19, { ocrWordReview: null })).toMatchObject({ body: { stale: true } })
    expect((await read(slug)).data.ocrWordReview).toMatchObject(state)
    await save(slug, 'תוספת מקורי') // An older client omits the optional field.
    expect((await Page.findById(page._id).lean()).ocrWordReview).toMatchObject(state)
    await save(slug, 'תוספת מקורי', 21, { ocrWordReview: { ...state, accepted: [] } })
    expect((await read(slug)).data.ocrWordReview.accepted).toEqual([])
  })

  it('new OCR invalidates old approvals and rejects their reintroduction by an old tab', async () => {
    const { slug, page } = await setup()
    const state = decision(ocrReviewRevision(page))
    await save(slug, 'מקורי', 1, { ocrWordReview: state })
    await Page.updateOne({ _id: page._id }, { $set: { lastOcrResultSha256: 'new-result' } })
    expect((await read(slug)).data.ocrWordReview).toBeNull()
    expect(await save(slug, 'מקורי', 2, { ocrWordReview: state })).toMatchObject({ status: 400 })
    expect((await Page.findById(page._id).lean()).contentSaveRevision).toBe(1)
  })

  it('rejects malformed/out-of-range approvals and enforces existing page ownership', async () => {
    const { slug, page } = await setup()
    const state = decision(ocrReviewRevision(page))
    for (const invalid of [{ ...state, accepted: [4] }, { ...state, words: [null] }, { ...state, version: 2 }]) {
      expect(await save(slug, 'מקורי', 1, { ocrWordReview: invalid })).toMatchObject({ status: 400 })
    }
    getServerSessionMock.mockResolvedValue({ user: { id: '507f1f77bcf86cd799439012', role: 'user' } })
    expect(await save(slug, 'מקורי', 1, { ocrWordReview: state })).toMatchObject({ status: 403 })
    expect((await Page.findById(page._id).lean()).ocrWordReview).toBeNull()
  })
})
