// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Book', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/OcrJob', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/lib/ocr/localCancel', () => ({ APPLY_STARTED_MESSAGE_HE: 'הקליטה כבר החלה', cancelLocalJob: vi.fn(), requestServerJobCancel: vi.fn() }))
import { getServerSession } from 'next-auth'
import Book from '@/models/Book'
import OcrJob from '@/models/OcrJob'
import { cancelLocalJob, requestServerJobCancel } from '@/lib/ocr/localCancel'
import { POST } from './route'
const BOOK = '507f1f77bcf86cd799439011'
const JOB = '507f1f77bcf86cd799439022'
const request = (body = { jobId: JOB }) => ({ json: async () => body })
const found = value => OcrJob.findOne.mockReturnValue({ select: () => ({ lean: async () => value }) })
beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'owner', roles: ['private_ocr'] } })
  Book.findById.mockResolvedValue({ isPrivate: true, privateOcr: true, ownerId: 'owner' })
  found({ _id: JOB, book: BOOK, method: 'local' })
  cancelLocalJob.mockResolvedValue({ ok: true })
  requestServerJobCancel.mockResolvedValue({ ok: true })
})
it.each(['local', 'ocrwin'])('ביטול לפי מזהה עבודה בודק גם את בעלות הספר (%s)', async method => {
  found({ _id: JOB, book: BOOK, method })
  expect((await POST(request())).status).toBe(200)
  expect(method === 'local' ? cancelLocalJob : requestServerJobCancel).toHaveBeenCalledWith(JOB, expect.objectContaining({ reason: 'owner' }))
})
it.each([{ isPrivate: true, privateOcr: true, ownerId: 'other' }, { isPrivate: false, ownerId: 'owner' }, null])('אינו מבטל עבודה של ספר אחר או ציבורי', async book => {
  Book.findById.mockResolvedValue(book)
  expect((await POST(request())).status).toBe(404)
  expect(cancelLocalJob).not.toHaveBeenCalled()
  expect(requestServerJobCancel).not.toHaveBeenCalled()
})
it('אין דרך להסוות עבודה זרה באמצעות bookId אחר', async () => {
  expect((await POST(request({ jobId: JOB, bookId: '507f1f77bcf86cd799439033' }))).status).toBe(404)
  expect(cancelLocalJob).not.toHaveBeenCalled()
})
it('ללא התפקיד אין בדיקת עבודה', async () => {
  getServerSession.mockResolvedValue({ user: { id: 'owner', role: 'user' } })
  expect((await POST(request())).status).toBe(403)
  expect(OcrJob.findOne).not.toHaveBeenCalled()
})
it('מנהל כללי יכול לבטל עבודה של אחר', async () => {
  getServerSession.mockResolvedValue({ user: { role: 'admin' } })
  expect((await POST(request())).status).toBe(200)
})

it('מצב ביטול OCR אינו עוצר אימון', async () => {
  found({ _id: JOB, book: BOOK, method: 'local', taskType: 'training' })
  expect((await POST(request())).status).toBe(409)
  expect(cancelLocalJob).not.toHaveBeenCalled()
})
