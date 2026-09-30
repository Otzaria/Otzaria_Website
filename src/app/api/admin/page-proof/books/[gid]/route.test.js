// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// מחיקת ספר בהגהת-עמודים: גם התמונות הממוזערות של רשת-העמודים (שאינן
// בתיקיית הספר) נמחקות. המודלים, הדיסק והממוזערות — מדומים.

const { getServerSessionMock, Sub, Page, Book, removeThumbs, fsRemove } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  Sub: { deleteMany: vi.fn() },
  Page: { find: vi.fn(), deleteMany: vi.fn() },
  Book: { findOne: vi.fn(), deleteOne: vi.fn(), findOneAndUpdate: vi.fn() },
  removeThumbs: vi.fn(),
  fsRemove: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/models/PageProofSubmission', () => ({ default: Sub }))
vi.mock('@/models/PageProofPage', () => ({ default: Page }))
vi.mock('@/models/PageProofBook', () => ({ default: Book }))
vi.mock('@/lib/pageProof/importPackages', () => ({ IMAGE_ROOT: '/uploads/page-proof' }))
vi.mock('@/lib/ocr/images', () => ({ resolveImageFsPath: (rel) => `/data${rel}` }))
vi.mock('@/lib/pageProof/thumbs', () => ({ removeThumbs }))
vi.mock('fs-extra', () => ({ default: { remove: fsRemove } }))

import { DELETE } from './route'

const GID = 'a1b2c3d4e5f6a7b8'
const lean = (v) => ({ lean: vi.fn().mockResolvedValue(v) })
const params = { params: Promise.resolve({ gid: GID }) }

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue({ user: { id: 'u1', role: 'admin_ocr' } })
  Book.findOne.mockReturnValue(lean({ _id: 'b1', gid: GID }))
  Page.find.mockReturnValue(lean([{ _id: 'p1' }, { _id: 'p2' }]))
  removeThumbs.mockResolvedValue(2)
})

describe('DELETE /api/admin/page-proof/books/[gid]', () => {
  it('מוחק עמודים, הגשות, תיקיית-התמונות — וגם את הממוזערות של העמודים', async () => {
    const res = await DELETE({}, params)
    expect(res.status).toBe(200)
    expect(Page.deleteMany).toHaveBeenCalledWith({ book: 'b1' })
    expect(Sub.deleteMany).toHaveBeenCalledWith({ book: 'b1' })
    expect(fsRemove).toHaveBeenCalledWith(`/data/uploads/page-proof/${GID}`)
    expect(removeThumbs).toHaveBeenCalledWith(['p1', 'p2'])
    // המזהים נאספו לפני המחיקה
    expect(Page.find.mock.invocationCallOrder[0]).toBeLessThan(Page.deleteMany.mock.invocationCallOrder[0])
  })

  it('כשל במחיקת ממוזערת אינו מכשיל את מחיקת הספר', async () => {
    removeThumbs.mockRejectedValueOnce(new Error('EBUSY'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await DELETE({}, params)).status).toBe(200)
    err.mockRestore()
  })
})
