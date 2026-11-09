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
    // לשונית ישנה: הטקסט החדש נשמר, ההחלטות הישנות נזרקות והתשובה מסמנת זאת (בלי 400 ובלי איבוד עריכות)
    expect(await save(slug, 'עריכה חדשה', 2, { ocrWordReview: state })).toMatchObject({ status: 200, body: { success: true, ocrWordReviewDropped: true } })
    const after = await Page.findById(page._id).lean()
    expect(after).toMatchObject({ content: 'עריכה חדשה', contentSaveRevision: 2 })
    expect(after.ocrWordReview).toMatchObject(state) // לא נכתבו מחדש; ה-GET מסנן אותן לפי הגרסה
    expect((await read(slug)).data.ocrWordReview).toBeNull()
  })

  it('הזיהוי הוחלף בין הקריאה לכתיבה: העדכון המותנה נכשל, הטקסט נשמר וההחלטות נזרקות', async () => {
    const { slug, page } = await setup()
    const staleSnapshot = await Page.findOne({ _id: page._id })
    const state = decision(ocrReviewRevision(staleSnapshot))
    await Page.updateOne({ _id: page._id }, { $set: { lastOcrResultSha256: 'replaced-during-save' } })
    const spy = vi.spyOn(Page, 'findOne').mockResolvedValueOnce(staleSnapshot)
    try {
      expect(await save(slug, 'עריכה', 5, { ocrWordReview: state })).toMatchObject({ status: 200, body: { ocrWordReviewDropped: true } })
    } finally {
      spy.mockRestore()
    }
    const after = await Page.findById(page._id).lean()
    expect(after).toMatchObject({ content: 'עריכה', contentSaveRevision: 5 })
    expect(after.ocrWordReview ?? null).toBeNull()
  })

  it('הזיהוי תואם: ההחלטות נכתבות ואין סימון ocrWordReviewDropped', async () => {
    const { slug, page } = await setup()
    const state = decision(ocrReviewRevision(page))
    const res = await save(slug, 'מקורי', 1, { ocrWordReview: state })
    expect(res.status).toBe(200)
    expect(res.body.ocrWordReviewDropped).toBeUndefined()
    expect((await Page.findById(page._id).lean()).ocrWordReview).toMatchObject(state)
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

describe('offline compare-and-swap and receipts', () => {
  const read = async slug => (await (await GET(new Request(`http://localhost/api/page-content?bookPath=${slug}&pageNumber=1`))).json()).data
  const offlineSave = async (slug, content, baseVersion, extra = {}) => save(slug, content, 100, {
    leftColumn: '', rightColumn: '', rightColumnName: 'חלק 1', leftColumnName: 'חלק 2',
    baseVersion, expectedUserId: USER_ID, offlineSaveId: '11111111-1111-4111-8111-111111111111', ...extra,
  })
  it('round trips a version and safely retries after the successful response was lost', async () => {
    const { slug } = await setup()
    const loaded = await read(slug)
    expect(loaded.contentVersion).toMatch(/^[a-f0-9]{64}$/)
    const result = await offlineSave(slug, 'אופליין', loaded.contentVersion)
    expect(result).toMatchObject({ status: 200, body: { success: true } })
    expect(result.body.contentVersion).not.toBe(loaded.contentVersion)
    const retry = await offlineSave(slug, 'אופליין', loaded.contentVersion)
    expect(retry).toMatchObject({ status: 200, body: { contentVersion: result.body.contentVersion } })
  })
  it.each(['content', 'rightColumn', 'imagePath', 'ocrWordReview'])('rejects a stale baseline when %s changed, including unversioned writers', async field => {
    const { slug, page } = await setup()
    const loaded = await read(slug)
    const value = field === 'ocrWordReview'
      ? { version: 1, revision: 'new', words: ['מילה'], accepted: [0] } : 'חדש'
    await Page.updateOne({ _id: page._id }, { $set: { [field]: value } })
    expect(await offlineSave(slug, 'אופליין', loaded.contentVersion)).toMatchObject({ status: 409, body: { code: 'OFFLINE_CONFLICT' } })
    expect((await Page.findById(page._id)).content).not.toBe('אופליין')
  })
  it('guards the atomic update against a write between read and commit', async () => {
    const { slug, page } = await setup()
    const loaded = await read(slug)
    const old = await Page.findById(page._id)
    await Page.updateOne({ _id: page._id }, { $set: { content: 'במקביל' } })
    const spy = vi.spyOn(Page, 'findOne').mockResolvedValueOnce(old)
    try { expect(await offlineSave(slug, 'אופליין', loaded.contentVersion)).toMatchObject({ status: 409 }) }
    finally { spy.mockRestore() }
    expect((await Page.findById(page._id)).content).toBe('במקביל')
  })
  it('does not mistake a later external edit for a lost-response receipt', async () => {
    const { slug, page } = await setup()
    const loaded = await read(slug)
    await offlineSave(slug, 'אופליין', loaded.contentVersion)
    await Page.updateOne({ _id: page._id }, { $set: { imagePath: '/new.jpg' } })
    expect(await offlineSave(slug, 'אופליין', loaded.contentVersion)).toMatchObject({ status: 409 })
  })
  it('refuses account switching, expired sessions, reassigned pages, and hidden books', async () => {
    const { slug, page } = await setup()
    const loaded = await read(slug)
    expect(await offlineSave(slug, 'אופליין', loaded.contentVersion, { expectedUserId: 'other' })).toMatchObject({ status: 403, body: { code: 'OFFLINE_ACCOUNT' } })
    getServerSessionMock.mockResolvedValueOnce(null)
    expect(await offlineSave(slug, 'אופליין', loaded.contentVersion)).toMatchObject({ status: 401 })
    await Page.updateOne({ _id: page._id }, { $set: { claimedBy: '507f1f77bcf86cd799439012' } })
    expect(await offlineSave(slug, 'אופליין', loaded.contentVersion)).toMatchObject({ status: 403 })
    await Page.updateOne({ _id: page._id }, { $set: { claimedBy: USER_ID } })
    await Book.updateOne({ _id: page.book }, { $set: { isHidden: true } })
    expect(await offlineSave(slug, 'אופליין', loaded.contentVersion)).toMatchObject({ status: 403 })
  })
  it('two writers with the same baseline cannot both succeed', async () => {
    const { slug } = await setup()
    const loaded = await read(slug)
    const results = await Promise.all([
      offlineSave(slug, 'לשונית א', loaded.contentVersion),
      offlineSave(slug, 'לשונית ב', loaded.contentVersion, { offlineSaveId: '22222222-2222-4222-8222-222222222222' }),
    ])
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
  })
})

 it('offline CAS rechecks ownership atomically even when the text is unchanged', async () => {
   const { slug, page } = await setup()
   const old = await Page.findById(page._id)
   const { pageVersion } = await import('@/lib/offlineBooks/version')
   await Page.updateOne({ _id: page._id }, { $set: { claimedBy: '507f1f77bcf86cd799439012' } })
   const spy = vi.spyOn(Page, 'findOne').mockResolvedValueOnce(old)
   try {
     expect(await save(slug, 'אופליין', 100, { baseVersion: pageVersion(old), expectedUserId: USER_ID,
       offlineSaveId: '11111111-1111-4111-8111-111111111111', leftColumn: '', rightColumn: '', rightColumnName: 'חלק 1', leftColumnName: 'חלק 2' })).toMatchObject({ status: 409 })
   } finally { spy.mockRestore() }
   expect((await Page.findById(page._id)).content).toBe('מקורי')
 })
