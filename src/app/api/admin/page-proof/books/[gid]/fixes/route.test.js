// @vitest-environment node
// ראוט-שרת: סביבת node (כמו בייצור). ב-jsdom גוף Uint8Array של Response (ה-ZIP) נתקע —
// אי-התאמה בין ה-realm של jsdom ל-Response של node, לא באג בראוט.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'

// הורדת תיקונים.json: ההגשה הראשית לכל עמוד (זו שמשנה חיתוך קודמת), מזהה/גרסה/
// חתימה לכל פעולה, ו-ZIP של כמה קבצים מעל התקרה של תוכנת-הספר. המודלים מדומים.

const { getServerSessionMock, Sub, Page, Book } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  Sub: { find: vi.fn(), updateMany: vi.fn() },
  Page: { find: vi.fn() },
  Book: { findOne: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/models/PageProofSubmission', () => ({ default: Sub }))
vi.mock('@/models/PageProofPage', () => ({ default: Page }))
vi.mock('@/models/PageProofBook', () => ({ default: Book }))

import { GET } from './route'
import { docRevision } from '@/lib/pageProof/textModel'

const GID = 'a1b2c3d4e5f6a7b8'
const lean = (v) => ({ lean: vi.fn().mockResolvedValue(v) })
const params = { params: Promise.resolve({ gid: GID }) }
const get = (qs = '') => GET({ url: `http://x/api/admin/page-proof/books/${GID}/fixes${qs}` }, params)
const admin = { user: { id: 'u1', role: 'admin_ocr' } }
const sub = (id, page, extra = {}) => ({ _id: id, pageNo: page, revision: 1, who: `otz-${id}`, reviewedAt: new Date('2026-09-29T10:00:00Z'), createdAt: new Date('2026-09-28'), exportedAt: null, ops: [], ...extra })

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue(admin)
  Book.findOne.mockReturnValue(lean({ title: 'ספר' }))
  Page.find.mockReturnValue(lean([{ page: 7, revision: 1, doc: { size: [100, 200], lines: [{ id: 3 }, { id: 4 }] } }]))
  Sub.updateMany.mockResolvedValue({ modifiedCount: 1 })
})

describe('GET /api/admin/page-proof/books/[gid]/fixes', () => {
  it('עמוד כפול: ההגשה עם תיקון-החיתוך בקובץ הראשי גם כשאושרה שנייה; לכל פעולה op_id, גרסה וחתימה', async () => {
    Sub.find.mockReturnValue(
      lean([
        sub('B', 7, { reviewedAt: new Date('2026-09-29T10:00:00Z'), ops: [{ kind: 'text', page: 7, ids: [3], value: 'אבג' }] }),
        sub('A', 7, { reviewedAt: new Date('2026-09-29T11:00:00Z'), needsRecut: true, ops: [{ kind: 'line_split', page: 7, ids: [4], value: { x: 50 } }] }),
      ])
    )
    const res = await get()
    expect(res.headers.get('Content-Type')).toMatch(/json/)
    expect(res.headers.get('X-Fixes-Files')).toBe('1')
    const file = JSON.parse(await res.text())
    expect(file.ops.map((o) => [o.kind, o.op_id, o.revision])).toEqual([['line_split', 'A:0', 1]])
    const sig = docRevision({ revision: 1, lines: [{ id: 3 }, { id: 4 }], size: [100, 200] })
    expect(file.ops[0].sig).toBe(sig)
    // הכפולים — ההגשה האחרת
    Sub.find.mockReturnValue(
      lean([
        sub('B', 7, { ops: [{ kind: 'text', page: 7, ids: [3], value: 'אבג' }] }),
        sub('A', 7, { reviewedAt: new Date('2026-09-29T11:00:00Z'), needsRecut: true, ops: [{ kind: 'line_split', page: 7, ids: [4], value: { x: 50 } }] }),
      ])
    )
    const dbl = JSON.parse(await (await get('?set=double')).text())
    expect(dbl.ops.map((o) => o.op_id)).toEqual(['B:0'])
  })

  it('מעל 5,000 פעולות ← ZIP של כמה קבצים, בלי לפצל עמוד; mark מסמן את כל ההגשות', async () => {
    const many = (page, n) => Array.from({ length: n }, (_, i) => ({ kind: 'line_ok', page, ids: [i + 1] }))
    Sub.find.mockReturnValue(lean([sub('s1', 1, { ops: many(1, 3000) }), sub('s2', 2, { ops: many(2, 3000) })]))
    Page.find.mockReturnValue(lean([]))
    const res = await get('?only=new&mark=1')
    expect(res.headers.get('Content-Type')).toBe('application/zip')
    expect(res.headers.get('X-Fixes-Files')).toBe('2')
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    const parts = Object.keys(files)
      .sort()
      .map((k) => JSON.parse(strFromU8(files[k])))
    expect(parts.map((f) => [f.gid, f.ops.length, new Set(f.ops.map((o) => o.page)).size])).toEqual([
      [GID, 3000, 1],
      [GID, 3000, 1],
    ])
    expect(Sub.updateMany.mock.calls[0][0]._id.$in).toEqual(['s1', 's2'])
  })

  it('403 בלי הרשאת OCR; gid לא תקין ← 400', async () => {
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'admin_books' } })
    expect((await get()).status).toBe(403)
    expect((await GET({ url: 'http://x' }, { params: Promise.resolve({ gid: 'x' }) })).status).toBe(400)
  })
})
