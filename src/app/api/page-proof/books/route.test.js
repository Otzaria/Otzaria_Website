import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// רשימת הספרים: המונים תלויים-בצופה, ולכן private, no-store.

const { session, listBooks } = vi.hoisted(() => ({ session: vi.fn(), listBooks: vi.fn() }))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/pageProof/pool', () => ({ requireProofSession: session }))
vi.mock('@/lib/pageProof/claims', () => ({ listBooks }))

import { GET as LIST } from './route'

const USER_ID = '64b7f0c2a1b2c3d4e5f60003'

beforeEach(() => {
  vi.clearAllMocks()
  session.mockResolvedValue({ userId: USER_ID })
})

describe('GET /api/page-proof/books', () => {
  it('רשימת הספרים של המשתמש', async () => {
    listBooks.mockResolvedValue([{ gid: 'g1', title: 'ספר', counts: { total: 3 } }])
    const res = await LIST()
    expect(listBooks).toHaveBeenCalledWith(USER_ID)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ success: true, books: [{ gid: 'g1', title: 'ספר', counts: { total: 3 } }] })
  })

  it('לא מאומת ← 403', async () => {
    session.mockResolvedValueOnce({ error: NextResponse.json({ success: false, error: 'רק משתמשים מאומתים' }, { status: 403 }) })
    const res = await LIST()
    expect(res.status).toBe(403)
    expect(listBooks).not.toHaveBeenCalled()
  })
})
