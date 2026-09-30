import { describe, it, expect, vi, beforeEach } from 'vitest'

// "תפוס את 5 העמודים": seq חייב להיות מספר שלם אי-שלילי; gid מהכתובת
// (מפוענח); התוצאה של claimSequence ← JSON.

const { session, claimSequence } = vi.hoisted(() => ({ session: vi.fn(), claimSequence: vi.fn() }))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/pageProof/pool', () => ({ requireProofSession: session }))
vi.mock('@/lib/pageProof/claims', () => ({ claimSequence }))

import { POST } from './route'

const USER_ID = '64b7f0c2a1b2c3d4e5f60003'
const ctx = (gid = 'g1') => ({ params: Promise.resolve({ gid }) })
const req = (body) => ({ json: () => (body instanceof Error ? Promise.reject(body) : Promise.resolve(body)) })

beforeEach(() => {
  vi.clearAllMocks()
  session.mockResolvedValue({ userId: USER_ID })
})

describe('POST /api/page-proof/books/[gid]/claim-seq', () => {
  it('רצף תקין ← claimSequence(gid, seq, userId) והתוצאה', async () => {
    claimSequence.mockResolvedValue({ ok: true, claimed: 3, pages: [{ id: 'a', page: 1 }] })
    const res = await POST(req({ seq: 2 }), ctx())
    expect(claimSequence).toHaveBeenCalledWith('g1', 2, USER_ID)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true, claimed: 3, pages: [{ id: 'a', page: 1 }] })
  })

  it('gid מקודד בכתובת ← מפוענח', async () => {
    claimSequence.mockResolvedValue({ ok: true, claimed: 1, pages: [] })
    await POST(req({ seq: 0 }), ctx('%D7%A1%D7%A4%D7%A8'))
    expect(claimSequence).toHaveBeenCalledWith('ספר', 0, USER_ID)
  })

  it.each([[{ seq: -1 }], [{ seq: 1.5 }], [{ seq: '2' }], [{}], [null]])('seq לא תקין (%j) ← 400', async (body) => {
    const res = await POST(req(body), ctx())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('מספר רצף לא תקין')
    expect(claimSequence).not.toHaveBeenCalled()
  })

  it('גוף שאינו JSON ← 400', async () => {
    expect((await POST(req(new SyntaxError('bad')), ctx())).status).toBe(400)
  })

  it('אין מה לתפוס ← 409 עם ההסבר', async () => {
    claimSequence.mockResolvedValue({ ok: false, status: 409, error: 'אין ברצף הזה עמודים פנויים לתפיסה' })
    const res = await POST(req({ seq: 0 }), ctx())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('אין ברצף הזה עמודים פנויים לתפיסה')
  })
})
