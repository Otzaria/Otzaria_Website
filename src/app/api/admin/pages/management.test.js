// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { Types } from 'mongoose'

vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { role: 'admin' } }) }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: async () => {} }))

import { startMongo } from '@/lib/corrections/testing/mongo'
import Book from '@/models/Book'
import Page from '@/models/Page'
import LibraryBook from '@/models/LibraryBook'
import { resolveConflict } from '@/lib/dicta/moderation-service'
import { GET as list } from './list/route'
import { PUT as update } from './update/route'
import { POST as download } from './download-batch/route'

const id = () => new Types.ObjectId()
const book = id()
const secondBook = id()
const worker = id()
const claimedAt = new Date('2026-01-01T00:00:00Z')
const updatedAt = new Date('2026-01-02T00:00:00Z')
const seeded = Array.from({ length: 52 }, (_, i) => ({
  _id: id(), book, pageNumber: i + 1, status: 'in-progress', claimedBy: worker, claimedAt, updatedAt,
}))
const markedText = 'ראשית\n========================================\nספר: דוגמה | עמוד: 9\n========================================\n\nסוף\n'
const other = {
  _id: id(), book: secondBook, pageNumber: 1, status: 'completed', isTwoColumns: true, rightColumn: markedText, leftColumn: 'שמאל',
}
const origin = 'http://localhost/api/admin/pages/'
const send = (endpoint, method, body) => new Request(origin + endpoint, { method, body: JSON.stringify(body) })

describe('ניהול עמודים והתנגשויות מול MongoDB', () => {
  let mongo
  beforeAll(async () => {
    mongo = await startMongo()
    if (mongo.skip) return
    await Book.collection.insertMany([{ _id: book, name: 'בראשית', slug: 'a' }, { _id: secondBook, name: 'שמות', slug: 'b' }])
    await Page.collection.insertMany([...seeded, other, { _id: id(), book: id(), pageNumber: 1, status: 'available' }])
  }, 30000)
  afterAll(async () => { if (mongo && !mongo.skip) await mongo.stop() })

  test('מיון ועימוד בשרת, קפיצה לעמוד ושמירת מזהה שיוך גם ללא רשומת משתמש', async ({ skip }) => {
    if (mongo.skip) return skip(mongo.skip)
    const result = await (await list(new Request(origin + 'list?view=management'))).json()
    expect(result.pagination).toMatchObject({ total: 53, page: 1, limit: 50 })
    expect(result.pages).toHaveLength(50)
    expect(result.pages[0]).toMatchObject({ id: String(seeded[0]._id), claimedBy: null, claimedById: String(worker) })
    expect(result.pages[0]).not.toHaveProperty('content')
    const params = new URLSearchParams({ view: 'management', book: 'בראשית', number: '51', stale: '14' })
    const jump = await (await list(new Request(origin + 'list?' + params))).json()
    expect(jump.target).toEqual({ id: String(seeded[50]._id), page: 2 })
  })

  test('שחרור מותנה לא דורס סיום או תפיסה חוזרת, ושחרור תקין מנקה את המכסה', async ({ skip }) => {
    if (mongo.skip) return skip(mongo.skip)
    const first = seeded[0]._id
    const expected = { status: 'in-progress', claimedById: String(worker), claimedAt: claimedAt.toISOString(), updatedAt: updatedAt.toISOString() }
    const release = () => update(send('update', 'PUT', { id: String(first), expected, release: true }))
    await Page.collection.updateOne({ _id: first }, { $set: { status: 'completed' } })
    expect(await (await release()).json()).toMatchObject({ outcome: 'changed', page: { status: 'completed' } })
    expect((await Page.findById(first).lean()).status).toBe('completed')
    await Page.collection.updateOne({ _id: first }, { $set: { status: 'in-progress', claimedAt: updatedAt, quotaUserId: worker, quotaSlot: 0 } })
    expect(await (await release()).json()).toMatchObject({ outcome: 'changed' })
    expected.claimedAt = updatedAt.toISOString()
    expect(await (await release()).json()).toMatchObject({ outcome: 'updated', claimedAt: null })
    const saved = await Page.findById(first).lean()
    expect(saved.status).toBe('available')
    expect(saved).not.toHaveProperty('quotaSlot')
    expect(saved).not.toHaveProperty('claimedBy')
  })

  test('הורדה לפי מזהים שומרת על כותרת פנימית, רווחים וטורים', async ({ skip }) => {
    if (mongo.skip) return skip(mongo.skip)
    const result = await (await download(send('download-batch', 'POST', { ids: [String(other._id)] }))).json()
    expect(result.pages).toEqual([{ id: String(other._id), text: `--- חלק 1 ---\n${markedText}\n\n--- חלק 2 ---\nשמאל` }])
  })

  test('הכרעה על כל הספר משתמשת בבסיס המקורי גם אחרי הכרעה בחלק', async ({ skip }) => {
    if (mongo.skip) return skip(mongo.skip)
    const bookId = id()
    await LibraryBook.collection.insertOne({
      _id: bookId, path: 'book.txt', title: 'book', version: 3, syncStatus: 'conflict',
      content: 'local', baseContent: 'upstream', baseSha: 'sha',
      conflict: { theirsContent: 'merged comparison text', theirsSha: 'sha' },
    })
    expect(await resolveConflict({ bookId, strategy: 'theirs' })).toEqual({ status: 'resolved', strategy: 'theirs' })
    expect(await resolveConflict({ bookId, strategy: 'ours' })).toEqual({ status: 'not-conflict' })
    expect(await LibraryBook.findById(bookId).lean()).toMatchObject({ content: 'upstream', syncStatus: 'clean', version: 4 })
  })
})
