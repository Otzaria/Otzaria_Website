import { describe, it, expect, vi, beforeEach } from 'vitest'

// רשימת הספרים בניהול הגהת-העמודים: מונה "ממתינים לזיהוי-מחדש" (recut) לכל ספר.

const { getServerSessionMock, Book, Page, Sub } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  Book: { find: vi.fn() },
  Page: { aggregate: vi.fn() },
  Sub: { aggregate: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/models/PageProofBook', () => ({ default: Book }))
vi.mock('@/models/PageProofPage', () => ({ default: Page }))
vi.mock('@/models/PageProofSubmission', () => ({ default: Sub }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue({ user: { role: 'admin' } })
  Book.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: 'b1', gid: 'g1', title: 'א' }, { _id: 'b2', gid: 'g2', title: 'ב' }]) }) })
  Page.aggregate.mockResolvedValue([{ _id: 'b1', open: 3, done: 4, recut: 2, double: 0, leased: 1 }])
  Sub.aggregate.mockResolvedValue([])
})

describe('GET /api/admin/page-proof', () => {
  it('401 בלי session, 403 בלי הרשאת OCR', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await GET()).status).toBe(401)
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'admin_plugins' } })
    expect((await GET()).status).toBe(403)
  })

  it('מונה recut לכל ספר (0 כשאין)', async () => {
    const body = await (await GET()).json()
    expect(body.books.map((b) => [b.gid, b.open, b.done, b.recut])).toEqual([
      ['g1', 3, 4, 2],
      ['g2', 0, 0, 0],
    ])
    // הספירה במסד: status === 'recut'
    const group = Page.aggregate.mock.calls[0][0][0].$group
    expect(group.recut).toEqual({ $sum: { $cond: [{ $eq: ['$status', 'recut'] }, 1, 0] } })
  })

  it('מונה "סגורים למתנדבים" לכל ספר (0 כשאין)', async () => {
    Page.aggregate.mockResolvedValue([{ _id: 'b1', open: 3, done: 4, recut: 0, double: 0, leased: 1, closed: 12 }])
    const body = await (await GET()).json()
    expect(body.books.map((b) => [b.gid, b.closed])).toEqual([
      ['g1', 12],
      ['g2', 0],
    ])
    // בלי השדה (עמוד מלפני שנוסף) — פתוח: רק volunteer === false נספר
    const group = Page.aggregate.mock.calls[0][0][0].$group
    expect(group.closed).toEqual({ $sum: { $cond: [{ $eq: ['$volunteer', false] }, 1, 0] } })
  })
})
