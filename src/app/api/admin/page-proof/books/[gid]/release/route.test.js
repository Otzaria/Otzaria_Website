import { describe, it, expect, vi, beforeEach } from 'vitest'

// שחרור תפיסות בידי מנהל: רק מנהל OCR (401/403), gid לא תקין ← 400, והבקשה
// ({ids} או {scope}) עוברת ל-adminPages.releaseClaims. adminPages מדומה.

const { getServerSessionMock, releaseClaims } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  releaseClaims: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/pageProof/adminPages', () => ({ releaseClaims }))

import { POST } from './route'

const GID = 'a1b2c3d4e5f6a7b8'
const ctx = (gid = GID) => ({ params: Promise.resolve({ gid }) })
const req = (body) => ({ json: vi.fn().mockResolvedValue(body) })

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue({ user: { id: 'u1', role: 'admin' } })
  releaseClaims.mockResolvedValue({ ok: true, released: 2 })
})

describe('POST /api/admin/page-proof/books/[gid]/release', () => {
  it('401 בלי session, 403 למתנדב — בלי לשחרר דבר', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    const r1 = await POST(req({ scope: 'all' }), ctx())
    expect(r1.status).toBe(401)
    expect(r1.headers.get('Cache-Control')).toBe('private, no-store')
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'user', isVerified: true } })
    expect((await POST(req({ scope: 'all' }), ctx())).status).toBe(403)
    expect(releaseClaims).not.toHaveBeenCalled()
  })

  it('עמודים מסוימים / תפיסות שפגו / הכול — עוברים כמות-שהם', async () => {
    const res = await POST(req({ ids: ['p1'] }), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, released: 2 })
    expect(releaseClaims).toHaveBeenLastCalledWith(GID, { ids: ['p1'], scope: null })
    await POST(req({ scope: 'expired' }), ctx())
    expect(releaseClaims).toHaveBeenLastCalledWith(GID, { ids: null, scope: 'expired' })
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('gid לא תקין / גוף חסר ← 400; שגיאה מ-adminPages ← הסטטוס וההסבר שלה', async () => {
    expect((await POST(req({ scope: 'all' }), ctx('bad gid'))).status).toBe(400)
    expect((await POST({ json: vi.fn().mockRejectedValue(new Error('x')) }, ctx())).status).toBe(400)
    releaseClaims.mockResolvedValueOnce({ ok: false, status: 404, error: 'הספר לא נמצא' })
    const res = await POST(req({ scope: 'all' }), ctx())
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('הספר לא נמצא')
  })
})
