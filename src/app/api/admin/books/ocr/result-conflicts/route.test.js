// @vitest-environment node
// סימון "נבדק" לתוצאה מתנגשת של עבודת OCR מקומי — מול MongoDB אמיתי. בלי בינארי Mongo — מדולג.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

import mongoose from 'mongoose'
import Book from '@/models/Book'
import OcrJob from '@/models/OcrJob'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { POST } from './route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
let job

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  getServerSessionMock.mockReset()
  getServerSessionMock.mockResolvedValue({ user: { role: 'admin_books_only', name: 'בודק' } })
  const book = await Book.create({ name: 'ספר', slug: `s-${Date.now()}` })
  job = await OcrJob.create({
    book: book._id,
    method: 'local',
    status: 'completed',
    active: false,
    resultConflicts: [
      { sha256: A, receivedAt: new Date(), bytes: 10, path: 'j/rejected-a.json' },
      { sha256: B, receivedAt: new Date(), bytes: 20, path: 'j/rejected-b.json' },
    ],
  })
})

const post = async (body) => {
  const res = await POST(new Request('http://localhost/api/admin/books/ocr/result-conflicts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { res, body: await res.json() }
}

describe('POST /api/admin/books/ocr/result-conflicts', () => {
  it('401 / 403', async () => {
    getServerSessionMock.mockResolvedValue(null)
    expect((await post({ jobId: String(job._id), sha256: A })).res.status).toBe(401)
    getServerSessionMock.mockResolvedValue({ user: { role: 'admin_plugins' } })
    expect((await post({ jobId: String(job._id), sha256: A })).res.status).toBe(403)
  })

  it('קובע reviewedAt רק לתוצאה המבוקשת; סימון חוזר אידמפוטנטי', async () => {
    const first = await post({ jobId: String(job._id), sha256: A.toUpperCase() })
    expect(first.res.status).toBe(200)
    expect(first.body.reviewedAt).toBeTruthy()
    expect(first.body.reviewedByName).toBe('בודק')

    const saved = await OcrJob.findById(job._id).lean()
    expect(saved.resultConflicts.find((c) => c.sha256 === A).reviewedAt).toBeInstanceOf(Date)
    expect(saved.resultConflicts.find((c) => c.sha256 === B).reviewedAt).toBeUndefined()

    const again = await post({ jobId: String(job._id), sha256: A })
    expect(again.res.status).toBe(200)
    expect(again.body.reviewedAt).toBe(first.body.reviewedAt)
  })

  it('400 על קלט לא תקין, 404 כשאין תוצאה כזו', async () => {
    expect((await post({ jobId: 'x', sha256: A })).res.status).toBe(400)
    expect((await post({ jobId: String(job._id), sha256: 'abc' })).res.status).toBe(400)
    expect((await post({ jobId: String(job._id), sha256: 'd'.repeat(64) })).res.status).toBe(404)
    expect((await post({ jobId: String(new mongoose.Types.ObjectId()), sha256: A })).res.status).toBe(404)
  })
})
