// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Book', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/OcrJob', () => ({ default: { findOne: vi.fn(), find: vi.fn() } }))
vi.mock('@/models/OcrConflict', () => ({ default: { countDocuments: vi.fn().mockResolvedValue(0) } }))
vi.mock('@/lib/ocr/workerAuth', () => ({ readWorkerConfig: () => ({ ok: false }) }))
vi.mock('@/lib/ocr/staleJobs', () => ({ reapStaleOcrJobs: vi.fn() }))
vi.mock('@/lib/ocr/bookOcrCounts', () => ({ countBookOcrPages: vi.fn().mockResolvedValue({ pagesWithImage: 1 }) }))
import { getServerSession } from 'next-auth'
import Book from '@/models/Book'
import OcrJob from '@/models/OcrJob'
import { GET } from './route'
const request = () => new Request('http://localhost/api/user/books/ocr/status?bookId=507f1f77bcf86cd799439011')
const chain = value => ({ sort() { return this }, select() { return this }, limit() { return this }, lean: async () => value })
beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'owner', roles: ['private_ocr'] } })
  Book.findById.mockReturnValue(chain({ _id: '507f1f77bcf86cd799439011', isPrivate: true, privateOcr: true, ownerId: 'owner' }))
  OcrJob.findOne.mockReturnValue(chain({ _id: 'job', method: 'ocrwin', status: 'completed', processedPages: 1 }))
  OcrJob.find.mockReturnValue(chain([]))
})
it('הבעלים רואה סטטוס ללא מטמון משותף', async () => {
  const res = await GET(request())
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect((await res.json()).job).toMatchObject({ status: 'completed', processedPages: 1 })
})
it.each([{ isPrivate: true, privateOcr: true, ownerId: 'other' }, { isPrivate: false, ownerId: 'owner' }, null])('אין סטטוס לספר זר או ציבורי', async book => {
  Book.findById.mockReturnValue(chain(book))
  expect((await GET(request())).status).toBe(404)
  expect(OcrJob.findOne).not.toHaveBeenCalled()
})
it('הבעלים בלי התפקיד מסורב', async () => {
  getServerSession.mockResolvedValue({ user: { id: 'owner', role: 'user' } })
  expect((await GET(request())).status).toBe(403)
})
it('מנהל כללי רואה גם סטטוס של ספר פרטי זר', async () => {
  getServerSession.mockResolvedValue({ user: { role: 'admin' } })
  expect((await GET(request())).status).toBe(200)
})

it('סטטוס בעלים אינו מחזיר אבחון פנימי ואינו טוען היסטוריית התנגשויות', async () => {
  OcrJob.findOne.mockReturnValue(chain({
    status: 'failed', processedPages: 0, totalPages: 1, errorCode: 'internal',
    error: 'private service detail', workerMessage: 'private worker detail', resultMetadataJson: '{"hidden":true}'
  }))
  const data = await (await GET(request())).json()
  expect(data.job).toEqual({
    status: 'failed', processedPages: 0, totalPages: 1, error: expect.any(String),
  })
  expect(data.job.error).not.toContain('private')
  expect(OcrJob.find).not.toHaveBeenCalled()
  expect(OcrJob.findOne).toHaveBeenCalledWith(expect.objectContaining({ taskType: { $ne: 'training' } }))
})
