import { describe, it, expect, vi, beforeEach } from 'vitest'

// requireTrainingProofSession — השער היחיד של /api/training-proof (docs/76 §8.2):
// 401 בלי התחברות, 403 עם access למי שאין לו גישה, מנהל OCR נכנס תמיד, admin:true
// רק למנהל, anyone:true מחזיר את המצב בלי לחסום. next-auth והמודל מדומים.

const { getSession, findOne } = vi.hoisted(() => ({ getSession: vi.fn(), findOne: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: getSession }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/models/TrainingProofVolunteer', () => ({
  default: { findOne: (...a) => ({ lean: () => findOne(...a) }) },
}))

import { requireTrainingProofSession } from './access'

const ID = '64b7f0c2a1b2c3d4e5f60003'
const as = (role, extra = {}) => getSession.mockResolvedValue({ user: { id: ID, role, ...extra } })

beforeEach(() => {
  vi.clearAllMocks()
  findOne.mockResolvedValue(null)
})

describe('requireTrainingProofSession', () => {
  it('בלי התחברות — 401', async () => {
    getSession.mockResolvedValue(null)
    const r = await requireTrainingProofSession()
    expect(r.error.status).toBe(401)
  })

  it('מחובר בלי רשומה — 403 עם access=none וההודעה', async () => {
    as('user')
    const r = await requireTrainingProofSession()
    expect(r.error.status).toBe(403)
    const body = await r.error.json()
    expect(body).toMatchObject({ error: 'אין לך הרשאת גישה לדף זה', access: 'none' })
  })

  it('בקשה ממתינה — 403 עם access=pending', async () => {
    as('user')
    findOne.mockResolvedValue({ status: 'pending' })
    const body = await (await requireTrainingProofSession()).error.json()
    expect(body.access).toBe('pending')
  })

  it('מגיה מאושר — נכנס; לא למסכי הניהול', async () => {
    as('user')
    findOne.mockResolvedValue({ status: 'approved' })
    const r = await requireTrainingProofSession()
    expect(r.error).toBeUndefined()
    expect(r).toMatchObject({ userId: ID, access: 'approved', isAdmin: false })
    expect(findOne).toHaveBeenCalledWith({ userId: ID })
    expect((await requireTrainingProofSession({ admin: true })).error.status).toBe(403)
  })

  it('מנהל OCR — נכנס גם בלי רשומה, וגם למסכי הניהול', async () => {
    as('admin_ocr')
    expect((await requireTrainingProofSession()).isAdmin).toBe(true)
    expect((await requireTrainingProofSession({ admin: true })).error).toBeUndefined()
  })

  it('מנהל ספרים (לא OCR) — אין גישה', async () => {
    as('admin_books')
    expect((await requireTrainingProofSession()).error.status).toBe(403)
  })

  it('anyone — מחזיר את המצב בלי לחסום', async () => {
    as('user')
    findOne.mockResolvedValue({ status: 'denied' })
    const r = await requireTrainingProofSession({ anyone: true })
    expect(r.error).toBeUndefined()
    expect(r.access).toBe('denied')
  })

  it('מזהה משתמש לא תקין — 401', async () => {
    getSession.mockResolvedValue({ user: { id: 'x', role: 'admin' } })
    expect((await requireTrainingProofSession()).error.status).toBe(401)
  })
})
