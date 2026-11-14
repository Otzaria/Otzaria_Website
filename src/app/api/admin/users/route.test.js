import { describe, it, expect, vi, beforeEach } from 'vitest'

// PUT /api/admin/users — תפקידים מרובים: roles (מערך) נשמר מנורמל, role נגזר ממנו (הראשי), ולקוח ישן
// ששולח role בלבד עדיין עובד. roles.js אמיתי (לא מדומה) — זו בדיוק ההתנהגות שנבדקת.
const { findByIdMock, findByIdAndUpdateMock, findOneMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  findByIdAndUpdateMock: vi.fn(),
  findOneMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/adminUsers', () => ({ getAdminUsersWithStats: vi.fn() }))
vi.mock('@/models/Page', () => ({ default: { updateMany: vi.fn() } }))
vi.mock('@/models/User', () => ({
  default: { findById: findByIdMock, findByIdAndUpdate: findByIdAndUpdateMock, findOne: findOneMock },
}))

import { getServerSession } from 'next-auth'
import { PUT } from './route'

const USER_ID = '507f1f77bcf86cd799439012'
const put = (body) => PUT({ json: async () => body })

function setSession(user) {
  getServerSession.mockResolvedValue(user ? { user } : null)
}

beforeEach(() => {
  findByIdMock.mockReset().mockReturnValue({ select: async () => ({ email: 'a@example.com' }) })
  findByIdAndUpdateMock.mockReset().mockReturnValue({ select: async () => ({ _id: USER_ID }) })
  findOneMock.mockReset()
  setSession({ id: 'boss', role: 'admin', roles: ['admin'] })
})

const lastUpdate = () => findByIdAndUpdateMock.mock.calls.at(-1)[1]

describe('PUT /api/admin/users — תפקידים', () => {
  it('כמה תפקידים: נשמרים מנורמלים (סדר עדיפות), ו-role הוא הראשי', async () => {
    const res = await put({ userId: USER_ID, name: 'x', points: 1, roles: ['admin_ocr', 'admin_books'] })
    expect(res.status).toBe(200)
    expect(lastUpdate()).toMatchObject({ roles: ['admin_books', 'admin_ocr'], role: 'admin_books' })
  })

  it('מנהל כללי עם עוד תפקידים — נשמר לבדו', async () => {
    await put({ userId: USER_ID, roles: ['admin_ocr', 'admin'] })
    expect(lastUpdate()).toMatchObject({ roles: ['admin'], role: 'admin' })
  })

  it('בלי תפקידים — משתמש רגיל', async () => {
    await put({ userId: USER_ID, roles: [] })
    expect(lastUpdate()).toMatchObject({ roles: [], role: 'user' })
  })

  it('לקוח ישן (role בלבד) — עדיין עובד, ו-roles מסונכרן', async () => {
    await put({ userId: USER_ID, role: 'admin_ocr' })
    expect(lastUpdate()).toMatchObject({ roles: ['admin_ocr'], role: 'admin_ocr' })
    await put({ userId: USER_ID, role: 'user' })
    expect(lastUpdate()).toMatchObject({ roles: [], role: 'user' })
  })

  it('בלי role ובלי roles — התפקידים לא נוגעים', async () => {
    await put({ userId: USER_ID, name: 'שם' })
    expect(lastUpdate()).not.toHaveProperty('roles')
    expect(lastUpdate()).not.toHaveProperty('role')
  })

  it('תפקיד לא מוכר — 400, בלי כתיבה', async () => {
    for (const body of [{ roles: ['admin_ocr', 'superuser'] }, { roles: 'admin' }, { role: 'superuser' }]) {
      const res = await put({ userId: USER_ID, ...body })
      expect(res.status).toBe(400)
    }
    expect(findByIdAndUpdateMock).not.toHaveBeenCalled()
  })

  it('רק מנהל כללי — גם כשהוא אחד מכמה תפקידים; מנהל ספרים + OCR — 403', async () => {
    setSession({ id: 'u', role: 'admin_books', roles: ['admin_books', 'admin_ocr'] })
    expect((await put({ userId: USER_ID, roles: ['admin'] })).status).toBe(403)
    setSession(null)
    expect((await put({ userId: USER_ID, roles: ['admin'] })).status).toBe(401)
  })
})
