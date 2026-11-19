// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'

const { getServerSessionMock, cancelLocalJobMock, requestServerJobCancelMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  cancelLocalJobMock: vi.fn(),
  requestServerJobCancelMock: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/models/Book', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/OcrJob', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/lib/ocr/localCancel', async (importOriginal) => ({
  ...(await importOriginal()),
  cancelLocalJob: cancelLocalJobMock,
  requestServerJobCancel: requestServerJobCancelMock,
}))

import Book from '@/models/Book'
import OcrJob from '@/models/OcrJob'
import { POST } from './route'

const BOOK = '507f1f77bcf86cd799439011'
const JOB = '507f1f77bcf86cd799439022'
const OWNER = '507f1f77bcf86cd799439099'
const request = (body) => ({ json: async () => body })
const lean = (value) => ({ select: () => ({ lean: async () => value }) })

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue({ user: { id: OWNER, name: 'בעלים', roles: ['private_ocr'] } })
  OcrJob.findOne.mockReturnValue(lean({ _id: JOB, method: 'local', book: BOOK }))
  Book.findById.mockReturnValue(lean({ _id: BOOK, ownerId: OWNER }))
  cancelLocalJobMock.mockResolvedValue({ ok: true })
  requestServerJobCancelMock.mockResolvedValue({ ok: true })
})

it.each([['local', { jobId: JOB }], ['ocrwin', { bookId: BOOK }]])('הבעלים עוצר עבודה בספר שלו (%s)', async (method, body) => {
  OcrJob.findOne.mockReturnValue(lean({ _id: JOB, method, book: BOOK }))
  const res = await POST(request(body))
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(method === 'local' ? cancelLocalJobMock : requestServerJobCancelMock).toHaveBeenCalled()
})

it.each([
  ['ספר של אחר', { _id: BOOK, ownerId: '507f1f77bcf86cd799439098' }],
  ['ספר ציבורי', { _id: BOOK }],
  ['ספר שנמחק', null],
])('עבודה ב%s — 404, ושום דבר לא נעצר (גם בביטול לפי jobId)', async (_name, book) => {
  Book.findById.mockReturnValue(lean(book))
  expect((await POST(request({ jobId: JOB }))).status).toBe(404)
  expect(cancelLocalJobMock).not.toHaveBeenCalled()
  expect(requestServerJobCancelMock).not.toHaveBeenCalled()
})

it('בלי התפקיד → 403, בלי לחפש עבודה', async () => {
  getServerSessionMock.mockResolvedValue({ user: { id: OWNER, role: 'user' } })
  expect((await POST(request({ jobId: JOB }))).status).toBe(403)
  expect(OcrJob.findOne).not.toHaveBeenCalled()
})
