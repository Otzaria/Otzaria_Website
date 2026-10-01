import { describe, it, expect, vi, beforeEach } from 'vitest'

// רשת-העמודים של ספר בניהול: GET (המצב של כל עמוד) ו-PATCH (המתג "פתוח
// למתנדבים"). רק מנהל OCR (401/403), gid לא תקין ← 400, והתוצאה של
// adminPages.js ← JSON; הכול private, no-store. adminPages מדומה.
// שניהם מקבלים גם מפתח-גישה של תוכנת-הספר (GET — read, PATCH — import); המפתח
// עצמו מול מסד אמיתי — tokenAccess.test.js. כאן: כש-Bearer נשלח, הוא קובע ולא ה-session.

const { getServerSessionMock, adminBookPages, setVolunteer } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  adminBookPages: vi.fn(),
  setVolunteer: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/pageProof/adminPages', () => ({ adminBookPages, setVolunteer }))

import { bearerFailures } from '@/lib/pageProof/tokenThrottle'
import { GET, PATCH } from './route'

const GID = 'a1b2c3d4e5f6a7b8'
const ctx = (gid = GID) => ({ params: Promise.resolve({ gid }) })
const patchReq = (body, authorization) => ({ json: vi.fn().mockResolvedValue(body), headers: new Headers(authorization ? { authorization } : {}) })
const DATA = { book: { gid: GID, title: 'ספר' }, pages: [{ id: 'p1', page: 1, state: 'open', volunteer: true }], counts: { total: 1 } }

beforeEach(() => {
  vi.clearAllMocks()
  bearerFailures.reset()
  getServerSessionMock.mockResolvedValue({ user: { id: 'u1', role: 'admin_ocr' } })
  adminBookPages.mockResolvedValue(DATA)
  setVolunteer.mockResolvedValue({ ok: true, changed: 3, open: 20, closed: 5 })
})

describe('GET /api/admin/page-proof/books/[gid]/pages', () => {
  it('401 בלי session, 403 בלי הרשאת OCR (גם מנהל ספרים) — בלי מטמון ובלי לגעת במסד', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    const r1 = await GET({}, ctx())
    expect(r1.status).toBe(401)
    expect(r1.headers.get('Cache-Control')).toBe('private, no-store')
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'admin_books' } })
    expect((await GET({}, ctx())).status).toBe(403)
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'user', isVerified: true } })
    expect((await GET({}, ctx())).status).toBe(403)
    expect(adminBookPages).not.toHaveBeenCalled()
  })

  it('gid לא תקין ← 400; ספר חסר ← 404', async () => {
    expect((await GET({}, ctx('../x'))).status).toBe(400)
    adminBookPages.mockResolvedValueOnce(null)
    const res = await GET({}, ctx())
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('מנהל OCR ← כל העמודים, בלי מטמון', async () => {
    const res = await GET({}, ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, ...DATA })
    expect(adminBookPages).toHaveBeenCalledWith(GID)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('PATCH /api/admin/page-proof/books/[gid]/pages', () => {
  it('"עמודים 1–20 פתוחים, וסגור את כל השאר" עובר כמות-שהוא; התשובה — המונים', async () => {
    const res = await PATCH(patchReq({ volunteer: true, from: 1, to: 20, others: false, junk: 1 }), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, changed: 3, open: 20, closed: 5 })
    expect(setVolunteer).toHaveBeenCalledWith(GID, { volunteer: true, ids: null, from: 1, to: 20, others: false })
  })

  it('לעמודים מסוימים; ושגיאת-קלט של adminPages ← 400 עם ההסבר', async () => {
    await PATCH(patchReq({ volunteer: false, ids: ['p1', 'p2'] }), ctx())
    expect(setVolunteer).toHaveBeenLastCalledWith(GID, { volunteer: false, ids: ['p1', 'p2'], from: null, to: null, others: null })
    setVolunteer.mockResolvedValueOnce({ ok: false, status: 400, error: 'טווח עמודים לא תקין' })
    const res = await PATCH(patchReq({ volunteer: true, from: 9, to: 2 }), ctx())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('טווח עמודים לא תקין')
  })

  it('גוף חסר או לא-אובייקט ← 400; בלי הרשאה ← 403 בלי לשנות דבר', async () => {
    expect((await PATCH({ json: vi.fn().mockRejectedValue(new Error('x')) }, ctx())).status).toBe(400)
    expect((await PATCH(patchReq([1, 2]), ctx())).status).toBe(400)
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'admin_books_only' } })
    expect((await PATCH(patchReq({ volunteer: true }), ctx())).status).toBe(403)
    expect(setVolunteer).not.toHaveBeenCalled()
  })

  it('עם Bearer — המפתח קובע ולא ה-session (גם כשמנהל מחובר): מפתח פגום ← 401 token_invalid, בלי לגעת בעמודים', async () => {
    const res = await PATCH(patchReq({ volunteer: false }, 'Bearer not-a-key'), ctx())
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('token_invalid')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(getServerSessionMock).not.toHaveBeenCalled()
    expect(setVolunteer).not.toHaveBeenCalled()
  })
})
