// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getServerSessionMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/ocr/runOcrJob', () => ({ runOcrJob: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/ocr/staleJobs', () => ({ reapStaleOcrJobs: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/models/Book', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/OcrJob', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }))
vi.mock('@/lib/ocr/bookOcrCounts', () => ({
  countBookOcrPages: vi.fn().mockResolvedValue({ editedPagesCount: 0, toProcess: { overwrite: 3, skip: 3, skip_edited: 3 } }),
}))

import Book from '@/models/Book'
import OcrJob from '@/models/OcrJob'
import { runOcrJob } from '@/lib/ocr/runOcrJob'
import { POST } from './route'
import { POST as adminPOST } from '@/app/api/admin/books/ocr/start/route'

const BOOK = '507f1f77bcf86cd799439011'
const OWNER = '507f1f77bcf86cd799439099'
const owner = { id: OWNER, name: 'בעלים', role: 'user', roles: ['private_ocr'] }
const request = () => ({ json: async () => ({ bookId: BOOK, method: 'ocrwin', existingTextMode: 'skip' }) })

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue({ user: owner })
  Book.findById.mockResolvedValue({ _id: BOOK, name: 'ספר אישי', slug: 'u-9099-sefer', isPrivate: true, ownerId: OWNER })
  OcrJob.findOne.mockResolvedValue(null)
  OcrJob.create.mockResolvedValue({ _id: 'job1' })
})

describe('POST /api/user/books/ocr/start', () => {
  it('בעל התפקיד מפעיל OCR על ספר אישי שלו — אותו מנוע כמו בניהול, בלי מטמון משותף', async () => {
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(OcrJob.create).toHaveBeenCalledWith(expect.objectContaining({ book: BOOK, startedBy: OWNER, method: 'ocrwin' }))
    expect(runOcrJob).toHaveBeenCalledWith('job1')
  })

  it.each([
    ['אין התחברות', null, 401],
    ['משתמש רגיל בלי התפקיד', { user: { id: OWNER, role: 'user' } }, 403],
    ['מנהל OCR (תפקיד אחר)', { user: { id: OWNER, role: 'admin_ocr' } }, 403],
  ])('%s → %i, בלי גישה לספר', async (_name, session, status) => {
    getServerSessionMock.mockResolvedValue(session)
    const res = await POST(request())
    expect(res.status).toBe(status)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(Book.findById).not.toHaveBeenCalled()
  })

  it.each([
    ['ספר אישי של משתמש אחר', { _id: BOOK, isPrivate: true, ownerId: '507f1f77bcf86cd799439098' }],
    ['ספר ציבורי (בלי בעלים)', { _id: BOOK, name: 'ציבורי' }],
    ['ספר שלא קיים', null],
  ])('%s → 404, ושום עבודה לא נוצרת', async (_name, book) => {
    Book.findById.mockResolvedValue(book)
    expect((await POST(request())).status).toBe(404)
    expect(OcrJob.create).not.toHaveBeenCalled()
    expect(runOcrJob).not.toHaveBeenCalled()
  })

  it('התפקיד אינו פותח את מסלול הניהול — גם לא לספר שלו', async () => {
    expect((await adminPOST(request())).status).toBe(403)
    expect(OcrJob.create).not.toHaveBeenCalled()
  })

  it('מסלול הניהול לא השתנה: מנהל ספרים מפעיל על כל ספר, גם בלי בעלים', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'u1', role: 'admin_books' } })
    Book.findById.mockResolvedValue({ _id: BOOK, name: 'ציבורי' })
    expect((await adminPOST(request())).status).toBe(200)
  })
})
