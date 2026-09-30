import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// תפיסה/שחרור של עמוד מרשת-העמודים: ההרשאה עוברת כמו שהיא (401/403 מ-
// requireProofSession), מזהה לא תקין ← 400, והתוצאה של claims.js ← JSON
// (הצלחה, או 409/404 עם ההסבר). הכול private, no-store.

const { session, claimPage, releasePage } = vi.hoisted(() => ({
  session: vi.fn(),
  claimPage: vi.fn(),
  releasePage: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/pageProof/pool', () => ({ requireProofSession: session }))
vi.mock('@/lib/pageProof/claims', () => ({ claimPage, releasePage }))

import { POST, DELETE } from './route'

const PAGE_ID = '64b7f0c2a1b2c3d4e5f60002'
const USER_ID = '64b7f0c2a1b2c3d4e5f60003'
const ctx = (id = PAGE_ID) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  session.mockResolvedValue({ userId: USER_ID })
})

describe('POST /api/page-proof/pages/[id]/claim', () => {
  it('בלי התחברות ← התגובה של requireProofSession (401), בלי מטמון', async () => {
    session.mockResolvedValueOnce({ error: NextResponse.json({ success: false, error: 'יש להתחבר' }, { status: 401 }) })
    const res = await POST({}, ctx())
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(claimPage).not.toHaveBeenCalled()
  })

  it('משתמש לא מאומת ← 403', async () => {
    session.mockResolvedValueOnce({
      error: NextResponse.json({ success: false, error: 'רק משתמשים מאומתים יכולים להגיה עמודים' }, { status: 403 }),
    })
    expect((await POST({}, ctx())).status).toBe(403)
  })

  it('מזהה עמוד לא תקין ← 400', async () => {
    const res = await POST({}, ctx('not-an-id'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('מזהה עמוד לא תקין')
    expect(claimPage).not.toHaveBeenCalled()
  })

  it('תפיסה מצליחה ← {success, page}', async () => {
    claimPage.mockResolvedValue({ ok: true, page: { id: PAGE_ID, page: 7, leasedUntil: '2026-09-30T12:00:00.000Z' } })
    const res = await POST({}, ctx())
    expect(claimPage).toHaveBeenCalledWith(PAGE_ID, USER_ID)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true, page: { id: PAGE_ID, page: 7, leasedUntil: '2026-09-30T12:00:00.000Z' } })
  })

  it('תפיסה שנדחתה ← הסטטוס וההסבר מ-claims.js', async () => {
    claimPage.mockResolvedValue({ ok: false, status: 409, error: 'העמוד נתפס בינתיים בידי מתנדב אחר' })
    const res = await POST({}, ctx())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ success: false, error: 'העמוד נתפס בינתיים בידי מתנדב אחר' })
  })

  it('שגיאה לא צפויה ← 500 בעברית', async () => {
    claimPage.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST({}, ctx())
    expect(res.status).toBe(500)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('DELETE /api/page-proof/pages/[id]/claim', () => {
  it('שחרור ← releasePage של המשתמש', async () => {
    releasePage.mockResolvedValue({ ok: true })
    const res = await DELETE({}, ctx())
    expect(releasePage).toHaveBeenCalledWith(PAGE_ID, USER_ID)
    expect(await res.json()).toEqual({ success: true })
  })

  it('עמוד שאינו של המשתמש ← 409', async () => {
    releasePage.mockResolvedValue({ ok: false, status: 409, error: 'העמוד אינו משויך אליכם' })
    const res = await DELETE({}, ctx())
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('העמוד אינו משויך אליכם')
  })
})
