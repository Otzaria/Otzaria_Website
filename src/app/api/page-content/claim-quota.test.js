// @vitest-environment node
// שמירה מעורך ישן בשעת פקיעת תפיסה/הקצאה מחדש: MongoDB אמיתי, ללא תחליפי DB.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: sessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
import mongoose from 'mongoose'
import Book from '@/models/Book'
import Page from '@/models/Page'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { claimBookPage, countActiveClaims } from '@/lib/bookPageClaims'
import { DAY_MS } from '@/lib/pageClaimPolicy'
import { POST } from './route'

vi.setConfig({ testTimeout: 60000 })
const userId = '507f1f77bcf86cd799439011'
let db, oldBook, otherBook, oldPage
beforeAll(async () => { db = await startMongo() }, 120000)
afterAll(async () => { if (db && !db.skip) await db.stop() })
beforeEach(async (ctx) => {
  vi.restoreAllMocks()
  if (db.skip) return ctx.skip()
  await db.reset()
  sessionMock.mockResolvedValue({ user: { _id: userId, id: userId, role: 'user' } })
  oldBook = await Book.create({ name: 'ספר ישן', slug: 'old-book' })
  otherBook = await Book.create({ name: 'ספר נוסף', slug: 'other-book' })
  oldPage = await Page.create({ book: oldBook._id, pageNumber: 1, imagePath: '/old.jpg', content: 'הטקסט המקורי' })
  const staleAt = new Date(Date.now() - 6 * DAY_MS)
  await Page.updateOne({ _id: oldPage._id }, { $set: {
    status: 'in-progress', claimedBy: new mongoose.Types.ObjectId(userId), claimedAt: staleAt, updatedAt: staleAt,
  } }, { timestamps: false })
  await Page.insertMany(Array.from({ length: 5 }, (_, i) => ({ book: otherBook._id, pageNumber: i + 1, imagePath: '/other.jpg' })))
})
const takeFive = async () => {
  for (const pageNumber of [1, 2, 3, 4, 5]) {
    expect((await claimBookPage({ userId, isAdmin: false, book: otherBook, pageNumber })).status).toBe(200)
  }
}
const save = (saveRevision) => POST(new Request('http://localhost/api/page-content', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    pageId: String(oldPage._id), content: 'שמירה מאוחרת', twoColumns: false,
    ...(saveRevision == null ? {} : { saveRevision }),
  }),
}))
// משהים רק את החזרת הקריאה המקורית; כל הקריאות והכתיבות עצמן נעשות מול MongoDB.
function betweenReadAndWrite(action) {
  const original = Page.findOne.bind(Page)
  vi.spyOn(Page, 'findOne').mockImplementationOnce(async (...args) => {
    const page = await original(...args)
    await action()
    return page
  })
}

describe('שמירה ותפיסות שפג תוקפן', () => {
  it('שמירה ישנה אחרי תפיסת חמישה עמודים אינה מחייה תפיסה ששוחררה', async () => {
    await takeFive()
    expect((await save(1)).status).toBe(200)
    const stored = await Page.findById(oldPage._id)
    expect(stored.status).toBe('available')
    expect(stored.content).toBe('שמירה מאוחרת')
    expect(await countActiveClaims(userId)).toBe(5)
  })
  it.each([undefined, 1])('שחרור בין הקריאה לשמירה נעצר גם ללקוח עם revision=%s', async (revision) => {
    betweenReadAndWrite(takeFive)
    expect((await save(revision)).status).toBe(409)
    expect((await Page.findById(oldPage._id)).content).toBe('הטקסט המקורי')
    expect(await countActiveClaims(userId)).toBe(5)
  })
  it('תפיסה מחדש בידי אחר בין הקריאה לכתיבה אינה מאפשרת לכותב הישן לשנות תוכן', async () => {
    const otherUser = new mongoose.Types.ObjectId()
    betweenReadAndWrite(async () => {
      expect((await claimBookPage({ userId: otherUser, isAdmin: false, book: oldBook, pageNumber: 1 })).status).toBe(200)
    })
    expect((await save(1)).status).toBe(409)
    const stored = await Page.findById(oldPage._id)
    expect(String(stored.claimedBy)).toBe(String(otherUser))
    expect(stored.content).toBe('הטקסט המקורי')
  })
  it('גם שחרור ותפיסה מחדש של אותו משתמש מזוהים לפי claimedAt', async () => {
    betweenReadAndWrite(async () => {
      expect((await claimBookPage({ userId, isAdmin: false, book: oldBook, pageNumber: 1 })).status).toBe(200)
    })
    expect((await save(1)).status).toBe(409)
    expect((await Page.findById(oldPage._id)).content).toBe('הטקסט המקורי')
  })
})
