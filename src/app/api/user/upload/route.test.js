// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/lib/cacheTags', () => ({ CACHE_TAGS: { BOOKS_ADMIN_LIST: 'books' }, revalidateNow: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => true }))
vi.mock('@/lib/client-ip', () => ({ getClientIp: () => '127.0.0.1' }))
vi.mock('fs-extra', () => ({ default: { ensureDir: vi.fn(), writeFile: vi.fn(), remove: vi.fn(), pathExists: vi.fn().mockResolvedValue(false) } }))
vi.mock('@/models/Book', () => ({ default: { create: vi.fn() } }))
vi.mock('@/models/Page', () => ({ default: { insertMany: vi.fn() } }))
vi.mock('@/lib/pdfConverter', () => ({ convertPdfToImages: vi.fn().mockResolvedValue([{}]) }))
import { getServerSession } from 'next-auth'
import Book from '@/models/Book'
import Page from '@/models/Page'
import { convertPdfToImages } from '@/lib/pdfConverter'
import { POST } from './route'
const request = () => ({ formData: async () => new Map([
  ['bookName', 'פרטי'], ['ownerId', 'other'], ['isPrivate', 'false'], ['sendNotification', 'true'],
  ['pdf', { type: 'application/pdf', size: 8, arrayBuffer: async () => new ArrayBuffer(8) }],
]) })
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
it.each([null, { user: { id: 'owner', role: 'user' } }, { user: { role: 'admin_ocr' } }])('בלי הרשאה אין המרה או כתיבה', async session => {
  getServerSession.mockResolvedValue(session)
  expect((await POST(request())).status).toBe(session ? 403 : 401)
  expect(convertPdfToImages).not.toHaveBeenCalled()
  expect(Book.create).not.toHaveBeenCalled()
})
