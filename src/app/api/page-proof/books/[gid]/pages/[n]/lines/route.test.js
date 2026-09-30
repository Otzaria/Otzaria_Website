import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// שורות של עמוד אחר (קישור לעמוד אחר): קריאה בלבד — בלי תפיסה, החכרה או שום כתיבה;
// private, no-store; עמוד שלא קיים ← 404; שורות שהוסרו לא נשלחות.

const { session, Page } = vi.hoisted(() => ({
  session: vi.fn(),
  Page: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), updateMany: vi.fn(), findById: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
// רק requireProofSession — אם הראוט היה מחדש החכרה (renewLease) או תופס רצף, הקריאה הייתה נכשלת
vi.mock('@/lib/pageProof/pool', () => ({ requireProofSession: session }))
vi.mock('@/models/PageProofPage', () => ({ default: Page }))

import { GET } from './route'

const lean = (v) => ({ lean: vi.fn().mockResolvedValue(v) })
const ctx = (gid, n) => ({ params: Promise.resolve({ gid, n }) })
const writes = () => [Page.findOneAndUpdate, Page.updateOne, Page.updateMany].flatMap((f) => f.mock.calls)

const stored = {
  page: 8,
  revision: 2,
  doc: {
    lines: [
      { id: 102, line_no: 1, order: 2, stream: 'notes', para_start: true, para_style: 'dh', text: 'כרבי יוחנן. שהוא' },
      { id: 101, line_no: 0, order: 1, stream: 'main', para_start: true, text: 'והלכה כרבי יוחנן' },
      { id: 103, line_no: 2, order: 3, stream: 'main', status: 'removed', text: 'הוסרה' },
    ],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  session.mockResolvedValue({ userId: '64b7f0c2a1b2c3d4e5f60003' })
})

describe('GET /api/page-proof/books/[gid]/pages/[n]/lines', () => {
  it('השורות בסדר-הקריאה, בלי שורות שהוסרו; שדות-השורה בלבד מהמסד; בלי שום כתיבה', async () => {
    Page.findOne.mockReturnValue(lean(stored))
    const res = await GET({}, ctx('g1', '8'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({
      success: true,
      page: 8,
      revision: 2,
      lines: [
        { id: 101, line_no: 0, order: 1, stream: 'main', para_start: true, para_style: null, text: 'והלכה כרבי יוחנן' },
        { id: 102, line_no: 1, order: 2, stream: 'notes', para_start: true, para_style: 'dh', text: 'כרבי יוחנן. שהוא' },
      ],
    })
    const [filter, projection] = Page.findOne.mock.calls[0]
    expect(filter).toEqual({ gid: 'g1', page: 8 })
    expect(projection).toMatchObject({ page: 1, 'doc.lines.id': 1, 'doc.lines.text': 1 })
    expect(Object.keys(projection).some((k) => /polygon|baseline|words/.test(k))).toBe(false)
    expect(writes()).toEqual([])
  })

  it('עמוד שלא קיים ← 404 בעברית', async () => {
    Page.findOne.mockReturnValue(lean(null))
    const res = await GET({}, ctx('g1', '9'))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('עמוד 9 לא נמצא בספר')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(writes()).toEqual([])
  })

  it('מזהה-ספר או מספר-עמוד לא תקינים ← 400, בלי לגשת למסד', async () => {
    for (const [gid, n] of [['', '8'], ['x'.repeat(201), '8'], ['g1', '0'], ['g1', 'abc'], ['g1', '-2'], ['g1', '1.5']]) {
      const res = await GET({}, ctx(gid, n))
      expect(res.status).toBe(400)
    }
    expect(Page.findOne).not.toHaveBeenCalled()
  })

  it('בלי התחברות ← 401 (no-store)', async () => {
    session.mockResolvedValueOnce({ error: NextResponse.json({ success: false, error: 'יש להתחבר' }, { status: 401 }) })
    const res = await GET({}, ctx('g1', '8'))
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(Page.findOne).not.toHaveBeenCalled()
  })
})
