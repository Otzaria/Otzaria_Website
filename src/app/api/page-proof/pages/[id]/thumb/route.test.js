import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// התמונה הממוזערת: רק למשתמש מאומת, JPEG במטמון הדפדפן בלבד (private);
// שגיאות — no-store.

const { session, pageThumb, Page } = vi.hoisted(() => ({
  session: vi.fn(),
  pageThumb: vi.fn(),
  Page: { findById: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/pageProof/pool', () => ({ requireProofSession: session }))
vi.mock('@/lib/pageProof/thumbs', () => ({ pageThumb }))
vi.mock('@/models/PageProofPage', () => ({ default: Page }))

import { GET } from './route'

const PAGE_ID = '64b7f0c2a1b2c3d4e5f60002'
const ctx = (id = PAGE_ID) => ({ params: Promise.resolve({ id }) })
const lean = (v) => ({ lean: vi.fn().mockResolvedValue(v) })

beforeEach(() => {
  vi.clearAllMocks()
  session.mockResolvedValue({ userId: '64b7f0c2a1b2c3d4e5f60003' })
})

describe('GET /api/page-proof/pages/[id]/thumb', () => {
  it('JPEG מהממוזערת, private ליום', async () => {
    Page.findById.mockReturnValue(lean({ _id: PAGE_ID, imagePath: '/uploads/page-proof/g1/p0001.jpg' }))
    pageThumb.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]))
    const res = await GET({}, ctx())
    expect(pageThumb).toHaveBeenCalledWith(PAGE_ID, '/uploads/page-proof/g1/p0001.jpg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]))
  })

  it('בלי התחברות ← 401 בלי לקרוא את התמונה', async () => {
    session.mockResolvedValueOnce({ error: NextResponse.json({ success: false, error: 'יש להתחבר' }, { status: 401 }) })
    const res = await GET({}, ctx())
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(pageThumb).not.toHaveBeenCalled()
  })

  it('מזהה לא תקין ← 400; עמוד שלא קיים ← 404', async () => {
    expect((await GET({}, ctx('bad'))).status).toBe(400)
    Page.findById.mockReturnValue(lean(null))
    const res = await GET({}, ctx())
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('תמונה חסרה בדיסק ← 500, בלי מטמון', async () => {
    Page.findById.mockReturnValue(lean({ _id: PAGE_ID, imagePath: '/uploads/page-proof/g1/missing.jpg' }))
    pageThumb.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET({}, ctx())
    expect(res.status).toBe(500)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
