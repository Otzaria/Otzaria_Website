import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// רשת-העמודים של ספר: תלויה-בצופה, ולכן private, no-store; ספר שלא קיים ← 404.

const { session, bookPages } = vi.hoisted(() => ({ session: vi.fn(), bookPages: vi.fn() }))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/pageProof/pool', () => ({ requireProofSession: session }))
vi.mock('@/lib/pageProof/claims', () => ({ bookPages }))

import { GET } from './route'

const USER_ID = '64b7f0c2a1b2c3d4e5f60003'
const ctx = (gid) => ({ params: Promise.resolve({ gid }) })

beforeEach(() => {
  vi.clearAllMocks()
  session.mockResolvedValue({ userId: USER_ID })
})

describe('GET /api/page-proof/books/[gid]', () => {
  it('הספר והעמודים בעיני המשתמש', async () => {
    const data = { book: { gid: 'g1', title: 'ספר', active: true }, pages: [{ id: 'p', page: 1, state: 'open' }], counts: { total: 1 } }
    bookPages.mockResolvedValue(data)
    const res = await GET({}, ctx('g1'))
    expect(bookPages).toHaveBeenCalledWith('g1', USER_ID)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true, ...data })
  })

  it('ספר שלא קיים ← 404', async () => {
    bookPages.mockResolvedValue(null)
    const res = await GET({}, ctx('nope'))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('הספר לא נמצא')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('מזהה ריק או ארוך מדי ← 400', async () => {
    expect((await GET({}, ctx(''))).status).toBe(400)
    expect((await GET({}, ctx('x'.repeat(201)))).status).toBe(400)
    expect(bookPages).not.toHaveBeenCalled()
  })

  it('בלי התחברות ← 401', async () => {
    session.mockResolvedValueOnce({ error: NextResponse.json({ success: false, error: 'יש להתחבר' }, { status: 401 }) })
    expect((await GET({}, ctx('g1'))).status).toBe(401)
  })
})
