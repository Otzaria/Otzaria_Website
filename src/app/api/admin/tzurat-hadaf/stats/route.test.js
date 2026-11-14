import { describe, it, expect, vi, beforeEach } from 'vitest'

// שער הניהול של צורת הדף (adminGate): 401 בלי session, 403 למי שאינו admin/admin_books, מפתח פגום — 401 token_invalid.
// ניהול המפתחות — רק session (Bearer לבדו ← 401).
const { getServerSessionMock, statsMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn(), statsMock: vi.fn() }))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/models/User', () => ({ default: {} }))
vi.mock('@/models/TzuratToken', () => ({ default: {} }))
vi.mock('@/lib/tzuratHadaf/admin', () => ({ adminStats: statsMock }))

import { GET } from './route'
import { GET as tokensGET } from '../tokens/route'

const req = (headers = {}) => new Request('http://localhost/api/admin/tzurat-hadaf/stats', { headers })

describe('GET /api/admin/tzurat-hadaf/stats', () => {
  beforeEach(() => {
    getServerSessionMock.mockReset()
    statsMock.mockReset()
    statsMock.mockResolvedValue({ books: [] })
  })

  it('401 בלי session', async () => {
    getServerSessionMock.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
  })

  it('403 לתפקידים שאינם מנהלי המודול', async () => {
    for (const role of ['user', 'admin_ocr', 'admin_books_only', 'model_trainer', 'admin_plugins']) {
      getServerSessionMock.mockResolvedValue({ user: { id: '64b7f0c2a1b2c3d4e5f60001', role } })
      expect((await GET(req())).status, role).toBe(403)
    }
    expect(statsMock).not.toHaveBeenCalled()
  })

  it('admin ו-admin_books עוברים', async () => {
    for (const role of ['admin', 'admin_books']) {
      getServerSessionMock.mockResolvedValue({ user: { id: '64b7f0c2a1b2c3d4e5f60001', role } })
      const res = await GET(req())
      expect(res.status, role).toBe(200)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
    }
  })

  it('Bearer פגום — 401 token_invalid, בלי לגשת ל-session', async () => {
    const res = await GET(req({ authorization: 'Bearer tht_short' }))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('token_invalid')
    expect(getServerSessionMock).not.toHaveBeenCalled()
  })

  it('ניהול המפתחות: בלי session — 401 (גם עם Bearer)', async () => {
    getServerSessionMock.mockResolvedValue(null)
    expect((await tokensGET()).status).toBe(401)
  })
})
