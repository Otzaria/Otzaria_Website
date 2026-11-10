// @vitest-environment node
// מסלולי ביטול הסיום נבדקים מול MongoDB standalone, כמו בפריסה.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: sessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
import mongoose from 'mongoose'
import Book from '@/models/Book'
import Page from '@/models/Page'
import User from '@/models/User'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { claimBookPage, countActiveClaims } from '@/lib/bookPageClaims'
import { POST } from './route'

vi.setConfig({ testTimeout: 60000 })
const userId = '507f1f77bcf86cd799439011'
let db, book, done
beforeAll(async () => { db = await startMongo() }, 120000)
afterAll(async () => { if (db && !db.skip) await db.stop() })
beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  sessionMock.mockResolvedValue({ user: { _id: userId, id: userId, role: 'user' } })
  await User.create({ _id: userId, name: 'מתנדב', email: 'review@example.invalid', points: 100 })
  book = await Book.create({ name: 'ספר', slug: 'quota-route', completedPages: 1 })
  await Page.insertMany(Array.from({ length: 7 }, (_, i) => ({ book: book._id, pageNumber: i + 1, imagePath: '/page.jpg' })))
  done = await Page.findOneAndUpdate({ book: book._id, pageNumber: 7 }, {
    status: 'completed', claimedBy: new mongoose.Types.ObjectId(userId), completedAt: new Date(),
  }, { returnDocument: 'after' })
})
const claim = (number) => claimBookPage({ userId, isAdmin: false, book, pageNumber: number })
const undo = () => POST(new Request('http://localhost/api/book/uncomplete-page', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pageId: String(done._id) }),
}))

describe('ביטול סיום והמכסה ללא טרנזקציות', () => {
  it('ביטול רגיל מעדכן את העמוד, מונה הספר והנקודות ב-standalone', async () => {
    const response = await undo()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, page: { status: 'in-progress', claimedBy: 'מתנדב' } })
    expect((await Book.findById(book._id)).completedPages).toBe(0)
    expect((await User.findById(userId)).points).toBe(90)
  })
  it('דחייה בגלל מכסה משאירה עמוד שהושלם ומונים ללא שינוי', async () => {
    for (const number of [1, 2, 3, 4, 5]) await claim(number)
    const response = await undo()
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'CLAIM_LIMIT_REACHED', activeClaims: 5 })
    expect((await Page.findById(done._id)).status).toBe('completed')
    expect((await Book.findById(book._id)).completedPages).toBe(1)
    expect((await User.findById(userId)).points).toBe(100)
  })
  it('תפיסה וביטול סיום שמתחרים על המקום החמישי אינם עוברים את המכסה', async () => {
    for (const number of [1, 2, 3, 4]) await claim(number)
    const [taken, undone] = await Promise.all([claim(5), undo()])
    expect([taken.status, undone.status].sort()).toEqual([200, 409])
    expect(await countActiveClaims(userId)).toBe(5)
    const completed = (await Page.findById(done._id)).status === 'completed'
    expect((await Book.findById(book._id)).completedPages).toBe(completed ? 1 : 0)
    expect((await User.findById(userId)).points).toBe(completed ? 100 : 90)
  })
  it('ביטולי סיום כפולים מפחיתים מונים ונקודות רק פעם אחת', async () => {
    const responses = await Promise.all([undo(), undo()])
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1)
    expect((await Book.findById(book._id)).completedPages).toBe(0)
    expect((await User.findById(userId)).points).toBe(90)
  })
})
