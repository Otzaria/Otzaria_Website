import { describe, it, expect, vi, beforeEach } from 'vitest'

// שער המתנדב של צורת הדף (requireTzuratSession): 401 בלי session, 403 בלי אימות, מנהל המודול עובר גם בלי אימות.
const { getServerSessionMock, findByIdMock, sampleMock, pause } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  findByIdMock: vi.fn(),
  sampleMock: vi.fn(),
  pause: { on: false },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/models/User', () => ({ default: { findById: findByIdMock } }))
vi.mock('@/lib/tzuratHadaf/tokenAuth', () => ({ getTzuratSession: vi.fn() }))
vi.mock('@/lib/tzuratHadaf/pause', () => ({ PAUSED_MSG: 'מושהה', itemsPaused: () => pause.on }))
vi.mock('@/lib/tzuratHadaf/items', () => ({
  sampleFastItem: sampleMock,
  fastItemFor: vi.fn(),
  fastStats: vi.fn().mockResolvedValue({ open: 3, mine: 0, mineAgreed: 0 }),
  parseExclude: vi.fn().mockReturnValue([]),
  hasPractice: vi.fn().mockResolvedValue(true),
}))

import { GET } from './route'

const req = (q = '') => new Request(`http://localhost/api/tzurat-hadaf/fast${q}`)
const USER_ID = '64b7f0c2a1b2c3d4e5f60001'

describe('GET /api/tzurat-hadaf/fast', () => {
  beforeEach(() => {
    getServerSessionMock.mockReset()
    findByIdMock.mockReset()
    sampleMock.mockReset()
    pause.on = false
    findByIdMock.mockReturnValue({ lean: () => Promise.resolve({ tzuratPracticeDone: false }) })
  })

  it('401 בלי session', async () => {
    getServerSessionMock.mockResolvedValue(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('403 למשתמש שאינו מאומת', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: USER_ID, role: 'user', isVerified: false } })
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBeTruthy()
  })

  it('מנהל OCR אינו מנהל המודול — 403 בלי אימות', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: USER_ID, role: 'admin_ocr', isVerified: false } })
    expect((await GET(req())).status).toBe(403)
  })

  it('מאומת שלא עשה תרגול — needPractice, בלי פריט', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: USER_ID, role: 'user', isVerified: true } })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ item: null, needPractice: true, practiceDone: false })
    expect(sampleMock).not.toHaveBeenCalled()
  })

  it('kind לא תקין — 400; רש"י — לכל מתנדב', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: USER_ID, role: 'admin_books', isVerified: false } })
    expect((await GET(req('?kind=zz'))).status).toBe(400)
    getServerSessionMock.mockResolvedValue({ user: { id: USER_ID, role: 'user', isVerified: true } })
    findByIdMock.mockReturnValue({ lean: () => Promise.resolve({ tzuratPracticeDone: true }) })
    sampleMock.mockResolvedValue(null)
    const body = await (await GET(req('?kind=r'))).json()
    expect(body).toMatchObject({ item: null, needPractice: false })
    expect(sampleMock).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ kind: 'r' }))
  })
})

it('counts statistics only when explicitly requested, not for every next question', async () => {
  const { fastStats } = await import('@/lib/tzuratHadaf/items')
  fastStats.mockClear()
  getServerSessionMock.mockResolvedValue({ user: { id: USER_ID, role: 'user', isVerified: true } })
  findByIdMock.mockReturnValue({ lean: () => Promise.resolve({ tzuratPracticeDone: true }) })
  sampleMock.mockResolvedValue(null)
  expect((await (await GET(req())).json()).stats).toBe(null)
  expect(fastStats).not.toHaveBeenCalled()
  expect((await (await GET(req('?stats=1'))).json()).stats).toEqual({ open: 3, mine: 0, mineAgreed: 0 })
  expect(fastStats).toHaveBeenCalledTimes(1)
})

it('שאלות מושהות — 503, גם למנהל המודול', async () => {
  pause.on = true
  getServerSessionMock.mockResolvedValue({ user: { id: USER_ID, role: 'user', isVerified: true } })
  findByIdMock.mockReturnValue({ lean: () => Promise.resolve({ tzuratPracticeDone: true }) })
  sampleMock.mockResolvedValue(null)
  const res = await GET(req())
  expect(res.status).toBe(503)
  expect(await res.json()).toMatchObject({ code: 'paused' })
  getServerSessionMock.mockResolvedValue({ user: { id: USER_ID, role: 'admin', isVerified: true } })
  expect((await GET(req())).status).toBe(503)
  pause.on = false
})
