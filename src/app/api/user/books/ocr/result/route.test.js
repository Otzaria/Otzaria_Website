// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Book', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/models/Page', () => ({ default: { find: vi.fn() } }))
import { getServerSession } from 'next-auth'
import Book from '@/models/Book'
import Page from '@/models/Page'
import { GET } from './route'
const request = () => new Request('http://localhost/api/user/books/ocr/result?bookId=507f1f77bcf86cd799439011')
beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'owner', roles: ['private_ocr'] } })
  Book.findById.mockResolvedValue({ isPrivate: true, ownerId: 'owner' })
  Page.find.mockReturnValue({ sort() { return this }, select() { return this }, lean: async () => [{ content: 'א' }, { content: 'ב' }] })
})
it('מייצא את הטקסט לפי מסלול הייצוא הקיים', async () => {
  const res = await GET(request())
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(await res.json()).toEqual({ success: true, combinedText: 'א\n\nב' })
})
it.each([{ isPrivate: true, ownerId: 'other' }, { isPrivate: false, ownerId: 'owner' }, null])('אין טקסט לספר זר או ציבורי', async book => {
  Book.findById.mockResolvedValue(book)
  expect((await GET(request())).status).toBe(404)
  expect(Page.find).not.toHaveBeenCalled()
})
it('בלי התפקיד אין הורדה', async () => {
  getServerSession.mockResolvedValue({ user: { id: 'owner', role: 'user' } })
  expect((await GET(request())).status).toBe(403)
})
it('מנהל כללי יכול להוריד ספר פרטי של אחר', async () => {
  getServerSession.mockResolvedValue({ user: { role: 'admin' } })
  expect((await GET(request())).status).toBe(200)
})
