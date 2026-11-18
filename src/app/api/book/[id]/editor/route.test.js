// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(), book: vi.fn(), page: vi.fn(), release: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Book', () => ({ default: { findOne: mocks.book } }))
vi.mock('@/models/Page', () => ({ default: { findOne: mocks.page } }))
vi.mock('@/lib/bookPageClaims', () => ({ releaseExpiredPageClaims: mocks.release }))

import { GET } from './route'
import { pageVersion } from '@/lib/offlineBooks/version'

const book = { _id: 'b', name: 'ספר', slug: 'book', totalPages: 20, examplePage: 12 }
const page = {
  _id: 'p', pageNumber: 3, content: 'תוכן', imagePath: '/uploads/scan.jpg',
  status: 'in-progress', claimedBy: 'u', contentSaveRevision: 5,
}
const read = (number = 3) => GET(new Request(`https://test.invalid/api/book/book/editor?page=${number}`), {
  params: Promise.resolve({ id: 'book' }),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockResolvedValue({ user: { id: 'u', role: 'user' } })
  mocks.book.mockReturnValue({ lean: async () => book })
  mocks.page.mockResolvedValue(page)
})

it('מחזיר את מצב העמוד, התוכן ופרטי הספר הפרטיים אחרי שחרור תפיסות ישנות', async () => {
  const res = await read()
  expect(res.status).toBe(200)
  expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await res.json()).toMatchObject({
    book: { id: 'b', totalPages: 20, examplePage: book.examplePage },
    data: { id: 'p', number: 3, content: 'תוכן', claimedById: 'u', status: 'in-progress', saveRevision: 5, contentVersion: pageVersion(page) },
  })
  expect(mocks.release).toHaveBeenCalledWith({ bookId: 'b' })
  expect(mocks.release.mock.invocationCallOrder[0]).toBeLessThan(mocks.page.mock.invocationCallOrder[0])
  expect(mocks.page).toHaveBeenCalledExactlyOnceWith({ book: 'b', pageNumber: 3 })
})

it('דוחה ללא session ומספר עמוד מחוץ לטווח לפני קריאה למסד', async () => {
  expect((await read(0)).status).toBe(400)
  mocks.session.mockResolvedValue(null)
  expect((await read()).status).toBe(401)
  expect(mocks.book).not.toHaveBeenCalled()
})

it('מגן על ספרים מוסתרים גם בפני משתמש מחובר עם הרשאת ניהול לא מתאימה', async () => {
  mocks.session.mockResolvedValue({ user: { id: 'u', role: 'admin_plugins' } })
  mocks.book.mockReturnValue({ lean: async () => ({ ...book, isHidden: true, ownerId: 'other' }) })
  expect((await read()).status).toBe(403)
  expect(mocks.page).not.toHaveBeenCalled()
  expect(mocks.release).not.toHaveBeenCalled()
})

it('מחזיר הודעת נעילה ללא תוכן, ומנהל ספרייה יכול לקרוא עמוד נעול', async () => {
  const locked = { ...page, claimedBy: 'other', populate: vi.fn(async () => { locked.claimedBy = { name: 'בעל התפיסה' } }) }
  mocks.page.mockResolvedValueOnce(locked).mockResolvedValueOnce({ ...page, claimedBy: 'other', status: 'completed' })
  const denied = await read()
  expect(denied.status).toBe(403)
  expect(await denied.json()).toEqual({ error: expect.stringContaining('בעל התפיסה') })
  mocks.session.mockResolvedValue({ user: { id: 'u', role: 'admin_books_only' } })
  expect((await read()).status).toBe(200)
})

it('מחזיר 404 כשהספר לא קיים', async () => {
  mocks.book.mockReturnValue({ lean: async () => null })
  const res = await read()
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'הספר לא נמצא' })
  expect(mocks.page).not.toHaveBeenCalled()
})

it('מחזיר 404 כשהעמוד לא קיים', async () => {
  mocks.page.mockResolvedValue(null)
  const res = await read()
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'העמוד לא נמצא' })
})

it('מחזיר 500 על שגיאה בלתי צפויה', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.book.mockReturnValue({ lean: async () => { throw new Error('db down') } })
  const res = await read()
  expect(res.status).toBe(500)
  expect(await res.json()).toEqual({ error: 'שגיאה בטעינת תוכן העמוד' })
})

it('בעל ספר מוסתר רשאי לקרוא את העמוד', async () => {
  mocks.book.mockReturnValue({ lean: async () => ({ ...book, isHidden: true, ownerId: 'u' }) })
  const res = await read()
  expect(res.status).toBe(200)
  expect(mocks.page).toHaveBeenCalled()
})
