// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/lib/cacheTags', () => ({ CACHE_TAGS: { BOOKS_ADMIN_LIST: 'books' }, revalidateNow: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => true }))
vi.mock('@/lib/client-ip', () => ({ getClientIp: () => '127.0.0.1' }))
vi.mock('fs-extra', () => ({ default: { ensureDir: vi.fn(), mkdir: vi.fn(), writeFile: vi.fn(), remove: vi.fn(), pathExists: vi.fn().mockResolvedValue(false) } }))
vi.mock('@/models/Book', () => ({ default: { create: vi.fn(), exists: vi.fn() } }))
vi.mock('@/models/User', () => ({ default: { findByIdAndUpdate: vi.fn() } }))
vi.mock('@/models/Page', () => ({ default: { insertMany: vi.fn() } }))
vi.mock('@/lib/pdfConverter', () => ({ convertPdfToImages: vi.fn().mockResolvedValue([{}]) }))
import { getServerSession } from 'next-auth'
import Book from '@/models/Book'
import User from '@/models/User'
import Page from '@/models/Page'
import { convertPdfToImages } from '@/lib/pdfConverter'
import { POST } from './route'
function request(privateOcr = true) {
  const body = new FormData()
  body.append('pdf', new File(['fake PDF'], 'book.pdf', { type: 'application/pdf' }))
  body.append('bookName', 'פרטי')
  body.append('ownerId', 'other')
  body.append('isPrivate', 'false')
  return new Request('http://localhost/api/user/upload' + (privateOcr ? '?privateOcr=1' : ''), {
    method: 'POST', body,
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'owner', roles: ['private_ocr'] } })
  Book.create.mockImplementation(async value => ({ ...value, _id: 'book' }))
})
it('העלאה כופה פרטיות ובעלות מהסשן, בלי תלות בשדות מזויפים', async () => {
  expect((await POST(request())).status).toBe(200)
  expect(Book.create).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: true, privateOcr: true, ownerId: 'owner', isHidden: true }))
  const book = Book.create.mock.calls[0][0]
  expect(book.folderPath).toMatch(/^\/private-books\//)
  expect(Page.insertMany.mock.calls[0][0][0]).toMatchObject({ status: 'available', book: 'book' })
  expect(convertPdfToImages.mock.calls[0][0]).not.toContain('public')
})
it.each([null, { user: { id: 'owner', role: 'user' } }, { user: { id: 'owner', role: 'admin_ocr' } }])('בלי הרשאה אין המרה או כתיבה', async session => {
  getServerSession.mockResolvedValue(session)
  expect((await POST(request())).status).toBe(session ? 403 : 401)
  expect(convertPdfToImages).not.toHaveBeenCalled()
  expect(Book.create).not.toHaveBeenCalled()
})

it('משתמש רגיל עדיין יכול להעלות ספר לעורך לפי הכתובת הקיימת', async () => {
  getServerSession.mockResolvedValue({ user: { id: '507f1f77bcf86cd799439099', role: 'user' } })
  expect((await POST(request(false))).status).toBe(200)
  const book = Book.create.mock.calls[0][0]
  expect(book.folderPath).toMatch(/^\/uploads\/books\/u-9099/)
  expect(book).not.toHaveProperty('privateOcr')
  expect(Page.insertMany.mock.calls[0][0][0]).toMatchObject({
    status: 'in-progress', book: 'book', claimedBy: '507f1f77bcf86cd799439099',
  })
  expect(User.findByIdAndUpdate).toHaveBeenCalled()
})

it('שליחת גוף גדול למסלול הפרטי נעצרת לפני המרה', async () => {
  const oversized = request()
  oversized.headers.set('content-length', String(60 * 1024 * 1024))
  expect((await POST(oversized)).status).toBe(413)
  expect(convertPdfToImages).not.toHaveBeenCalled()
})
