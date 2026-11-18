// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('node:fs/promises', () => ({ readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2])) }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Book', () => ({ default: { findOne: vi.fn() } }))
import { readFile } from 'node:fs/promises'
import { getServerSession } from 'next-auth'
import Book from '@/models/Book'
import { GET } from './route'
const call = (file = 'page.1.jpg') => GET(new Request('http://localhost/private-books/x'), { params: Promise.resolve({ slug: '11111111-1111-4111-8111-111111111111', file }) })
beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'owner', role: 'private_ocr' } })
  Book.findOne.mockReturnValue({ lean: async () => ({ isPrivate: true, privateOcr: true, ownerId: 'owner' }) })
})
it('סריקה מותרת לבעלים ולמנהל, ללא מטמון משותף', async () => {
  for (const user of [{ id: 'owner', role: 'private_ocr' }, { role: 'admin' }]) {
    getServerSession.mockResolvedValue({ user })
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  }
})
it.each([null, { user: { id: 'other', role: 'private_ocr' } }, { user: { id: 'owner', role: 'user' } }])('404 ללא הרשאה או בעלות, לפני קריאת הקובץ', async session => {
  getServerSession.mockResolvedValue(session)
  expect((await call()).status).toBe(404)
  expect(readFile).not.toHaveBeenCalled()
})
it('אין קריאת PDF המקור או יציאה מתיקיית הספר', async () => {
  for (const file of ['source.pdf', '../page.1.jpg', '../../secret']) expect((await call(file)).status).toBe(404)
  expect(readFile).not.toHaveBeenCalled()
})
