// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Book', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/OcrJob', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }))
vi.mock('@/lib/ocr/runOcrJob', () => ({ runOcrJob: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/ocr/staleJobs', () => ({ reapStaleOcrJobs: vi.fn() }))
vi.mock('@/lib/ocr/bookOcrCounts', () => ({ countBookOcrPages: vi.fn().mockResolvedValue({ editedPagesCount: 0, toProcess: { overwrite: 1, skip: 1 } }) }))
import { getServerSession } from 'next-auth'
import Book from '@/models/Book'
import OcrJob from '@/models/OcrJob'
import { runOcrJob } from '@/lib/ocr/runOcrJob'
import { POST } from './route'
import { POST as adminStart } from '@/app/api/admin/books/ocr/start/route'

const BOOK = '507f1f77bcf86cd799439011'
const user = { id: '507f1f77bcf86cd799439099', roles: ['private_ocr'] }
const request = () => ({ json: async () => ({ bookId: BOOK, method: 'ocrwin', existingTextMode: 'overwrite' }) })

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user })
  Book.findById.mockResolvedValue({ _id: BOOK, name: 'פרטי', isPrivate: true, privateOcr: true, ownerId: user.id })
  OcrJob.findOne.mockResolvedValue(null)
  OcrJob.create.mockResolvedValue({ _id: 'job' })
})

describe('הפעלת OCR פרטי', () => {
  it('מפעיל את אותו מנוע על הספר הפרטי של הבעלים', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(OcrJob.create).toHaveBeenCalledWith(expect.objectContaining({ book: BOOK, startedBy: user.id, existingTextMode: 'skip' }))
    expect(runOcrJob).toHaveBeenCalledWith('job')
  })
  it.each([null, { user: { ...user, roles: [] } }])('מסרב ללא הרשאה לפני גישה למסד', async session => {
    getServerSession.mockResolvedValue(session)
    expect((await POST(request())).status).toBe(session ? 403 : 401)
    expect(Book.findById).not.toHaveBeenCalled()
  })
  it.each([{ isPrivate: true, privateOcr: true, ownerId: 'other' }, { isPrivate: false, ownerId: user.id }, { isPrivate: true, ownerId: user.id }, null])('מחזיר 404 בלי הפעלה בספר שאינו שלו או שאינו פרטי', async book => {
    Book.findById.mockResolvedValue(book)
    expect((await POST(request())).status).toBe(404)
    expect(OcrJob.create).not.toHaveBeenCalled()
    expect(runOcrJob).not.toHaveBeenCalled()
  })
  it('התפקיד אינו מקבל את ראוט הניהול, גם עבור הספר שלו', async () => {
    expect((await adminStart(request())).status).toBe(403)
    expect(OcrJob.create).not.toHaveBeenCalled()
  })
  it('מנהל כללי יכול לעבד גם ספר פרטי של אחר ובניהול גם ספר ציבורי', async () => {
    getServerSession.mockResolvedValue({ user: { role: 'admin' } })
    expect((await POST(request())).status).toBe(200)
    Book.findById.mockResolvedValue({ _id: BOOK, name: 'ציבורי' })
    expect((await adminStart(request())).status).toBe(200)
  })
})
