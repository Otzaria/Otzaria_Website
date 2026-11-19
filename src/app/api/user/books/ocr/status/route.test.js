// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/ocr/staleJobs', () => ({ reapStaleOcrJobs: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/ocr/workerAuth', () => ({ readWorkerConfig: () => ({ ok: false }) }))
vi.mock('@/lib/ocr/bookOcrCounts', () => ({ countBookOcrPages: vi.fn().mockResolvedValue({ pagesWithImage: 3, editedPagesCount: 0 }) }))
vi.mock('@/models/Book', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/OcrJob', () => ({ default: { findOne: vi.fn(), find: vi.fn() } }))
vi.mock('@/models/OcrConflict', () => ({ default: { countDocuments: vi.fn().mockResolvedValue(0) } }))

import Book from '@/models/Book'
import OcrJob from '@/models/OcrJob'
import { GET } from './route'

const BOOK = '507f1f77bcf86cd799439011'
const OWNER = '507f1f77bcf86cd799439099'
const chain = (value) => ({ sort() { return this }, select() { return this }, limit() { return this }, lean: async () => value })
const request = () => new Request(`http://localhost/api/user/books/ocr/status?bookId=${BOOK}`)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue({ user: { id: OWNER, roles: ['private_ocr'] } })
  Book.findById.mockReturnValue(chain({ _id: BOOK, name: 'ספר אישי', ownerId: OWNER }))
  OcrJob.findOne.mockReturnValue(chain(null))
  OcrJob.find.mockReturnValue(chain([]))
})

it('הבעלים רואה את מצב ה-OCR של הספר שלו, בלי מטמון משותף', async () => {
  const res = await GET(request())
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(await res.json()).toMatchObject({ success: true, job: null, counts: { pagesWithImage: 3 } })
})

it.each([
  ['ספר של אחר', { _id: BOOK, ownerId: '507f1f77bcf86cd799439098' }],
  ['ספר ציבורי', { _id: BOOK }],
])('%s → 404 בלי לקרוא עבודות', async (_name, book) => {
  Book.findById.mockReturnValue(chain(book))
  expect((await GET(request())).status).toBe(404)
  expect(OcrJob.findOne).not.toHaveBeenCalled()
})

it('בלי התפקיד → 403', async () => {
  getServerSessionMock.mockResolvedValue({ user: { id: OWNER, role: 'user' } })
  expect((await GET(request())).status).toBe(403)
  expect(Book.findById).not.toHaveBeenCalled()
})
