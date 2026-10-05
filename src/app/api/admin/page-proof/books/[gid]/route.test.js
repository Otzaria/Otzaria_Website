// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ספר בהגהת-עמודים: השהיה/חידוש (PATCH — גם במפתח-גישה של תוכנת-הספר, import) ומחיקה
// (DELETE — רק session, לעולם לא מפתח). במחיקה גם התמונות הממוזערות של רשת-העמודים (שאינן
// בתיקיית הספר) נמחקות. המודלים, הדיסק והממוזערות — מדומים; המפתח עצמו מול מסד אמיתי —
// tokenAccess.test.js.

const { getServerSessionMock, Sub, Draft, Page, Book, removeThumbs, fsRemove } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  Sub: { deleteMany: vi.fn() },
  Draft: { deleteMany: vi.fn() },
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
vi.mock('@/models/PageProofDraft', () => ({ default: Draft }))
vi.mock('@/models/PageProofBook', () => ({ default: Book }))
vi.mock('@/lib/pageProof/importPackages', () => ({ IMAGE_ROOT: '/uploads/page-proof' }))
vi.mock('@/lib/ocr/images', () => ({ resolveImageFsPath: (rel) => `/data${rel}` }))
vi.mock('@/lib/pageProof/thumbs', () => ({ removeThumbs }))
vi.mock('fs-extra', () => ({ default: { remove: fsRemove } }))

import { bearerFailures } from '@/lib/pageProof/tokenThrottle'
import { DELETE, PATCH } from './route'

const GID = 'a1b2c3d4e5f6a7b8'
const lean = (v) => ({ lean: vi.fn().mockResolvedValue(v) })
const params = { params: Promise.resolve({ gid: GID }) }
const req = (body, authorization) => ({ json: vi.fn().mockResolvedValue(body), headers: new Headers(authorization ? { authorization } : {}) })

beforeEach(() => {
  vi.clearAllMocks()
  bearerFailures.reset()
  getServerSessionMock.mockResolvedValue({ user: { id: 'u1', role: 'admin_ocr' } })
  Book.findOne.mockReturnValue(lean({ _id: 'b1', gid: GID }))
  Book.findOneAndUpdate.mockResolvedValue({ _id: 'b1', gid: GID, status: 'paused' })
  Page.find.mockReturnValue(lean([{ _id: 'p1' }, { _id: 'p2' }]))
  removeThumbs.mockResolvedValue(2)
})

describe('PATCH /api/admin/page-proof/books/[gid] — השהיה וחידוש', () => {
  it('מנהל OCR: המצב נשמר ומוחזר; מצב לא מוכר ← 400; ספר חסר ← 404', async () => {
    const res = await PATCH(req({ status: 'paused' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, status: 'paused' })
    expect(Book.findOneAndUpdate).toHaveBeenCalledWith({ gid: GID }, { $set: { status: 'paused' } }, expect.anything())
    expect((await PATCH(req({ status: 'deleted' }), params)).status).toBe(400)
    Book.findOneAndUpdate.mockResolvedValueOnce(null)
    expect((await PATCH(req({ status: 'active' }), params)).status).toBe(404)
  })

  it('בלי session ← 401; בלי הרשאת OCR ← 403 — בלי לשנות דבר', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await PATCH(req({ status: 'paused' }), params)).status).toBe(401)
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'admin_books' } })
    expect((await PATCH(req({ status: 'paused' }), params)).status).toBe(403)
    expect(Book.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('עם Bearer — המפתח קובע ולא ה-session (גם כשמנהל מחובר): מפתח פגום ← 401 token_invalid, הספר לא משתנה', async () => {
    const res = await PATCH(req({ status: 'paused' }, 'Bearer not-a-key'), params)
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('token_invalid')
    expect(getServerSessionMock).not.toHaveBeenCalled()
    expect(Book.findOneAndUpdate).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/page-proof/books/[gid] — רק session, לעולם לא מפתח', () => {
  it('Bearer בלי session (גם מפתח בצורה תקינה) ← ה-401 הרגיל, לא token_* — ושום דבר לא נמחק', async () => {
    getServerSessionMock.mockResolvedValue(null)
    for (const authorization of [`Bearer ppt_${'A'.repeat(43)}`, 'Bearer not-a-key']) {
      const res = await DELETE(req(undefined, authorization), params)
      expect(res.status, authorization).toBe(401)
      expect((await res.json()).code, authorization).toBeUndefined()
    }
    expect(Book.findOne).not.toHaveBeenCalled()
    expect(Book.deleteOne).not.toHaveBeenCalled()
    expect(Page.deleteMany).not.toHaveBeenCalled()
    expect(Sub.deleteMany).not.toHaveBeenCalled()
    expect(Draft.deleteMany).not.toHaveBeenCalled()
    expect(fsRemove).not.toHaveBeenCalled()
    expect(removeThumbs).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/page-proof/books/[gid]', () => {
  it('מוחק עמודים, הגשות, טיוטות, תיקיית-התמונות — וגם את הממוזערות של העמודים', async () => {
    const res = await DELETE({}, params)
    expect(res.status).toBe(200)
    expect(Page.deleteMany).toHaveBeenCalledWith({ book: 'b1' })
    expect(Sub.deleteMany).toHaveBeenCalledWith({ book: 'b1' })
    expect(Draft.deleteMany).toHaveBeenCalledWith({ gid: GID })
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
