import { describe, it, expect, vi, beforeEach } from 'vitest'

// עמוד לעורך: הגשה נחשבת "שלי" רק לגרסה הנוכחית של העמוד — עמוד שחזר
// מזיהוי-מחדש נפתח לעריכה גם למי שהגיש את הגרסה הקודמת. המודלים מדומים.

const { getServerSessionMock, Sub, Page, Book } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  Sub: { find: vi.fn() },
  Page: { findById: vi.fn(), findOneAndUpdate: vi.fn() },
  Book: { findById: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/models/PageProofSubmission', () => ({ default: Sub }))
vi.mock('@/models/PageProofPage', () => ({ default: Page }))
vi.mock('@/models/PageProofBook', () => ({ default: Book }))

import { GET } from './route'

const PAGE_ID = '64b7f0c2a1b2c3d4e5f60002'
const USER_ID = '64b7f0c2a1b2c3d4e5f60003'
const lean = (v) => ({ lean: vi.fn().mockResolvedValue(v) })
const params = { params: Promise.resolve({ id: PAGE_ID }) }
const volunteer = { user: { id: USER_ID, name: 'מתנדב', role: 'user', isVerified: true } }
const page = (extra = {}) => ({
  _id: PAGE_ID,
  gid: 'a1b2c3d4e5',
  page: 3,
  seq: 0,
  required: 1,
  book: 'b1',
  doc: { page: 3, size: [10, 10], lines: [{ id: 1, bbox: [1, 1, 5, 5], text: 'א', polygon: [[1, 1]], baseline: [[1, 1]], recheck: true, para_breaks: [2] }] },
  ...extra,
})
const subsQuery = (list) => ({ sort: vi.fn().mockReturnValue(lean(list)) })

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue(volunteer)
  Book.findById.mockReturnValue(lean({ title: 'ספר', script: 'square' }))
})

describe('GET /api/page-proof/pages/[id]', () => {
  it('401 בלי session', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await GET({}, params)).status).toBe(401)
  })

  it('הגשה לגרסה הנוכחית ← מצב צפייה עם ההגשה', async () => {
    Page.findById.mockReturnValue(lean(page()))
    Sub.find.mockReturnValue(subsQuery([{ _id: 's1', status: 'approved', ops: [], note: '' }]))
    const body = await (await GET({}, params)).json()
    expect(body.mode).toBe('view')
    expect(body.submission).toMatchObject({ id: 's1', status: 'approved' })
    expect(Page.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('הגשה רק לגרסה קודמת ← העמוד (גרסה 2) נפתח לעריכה, בלי ההגשה הישנה', async () => {
    Page.findById.mockReturnValue(lean(page({ revision: 2 })))
    Sub.find.mockReturnValue(subsQuery([{ _id: 's1', status: 'approved', ops: [{ kind: 'line_ok' }], note: '' }]))
    Page.findOneAndUpdate.mockResolvedValue({ _id: PAGE_ID })
    const body = await (await GET({}, params)).json()
    expect(body.mode).toBe('edit')
    expect(body.submission).toBeNull()
    expect(body.page.revision).toBe(2)
    expect(body.page.doc.revision).toBe(2)
    expect(body.page.imageUrl).toBe(`/api/page-proof/pages/${PAGE_ID}/image?v=2`)
  })

  it('שדות-השורה נשלחים כפי שהגיעו (recheck, para_breaks) בלי polygon/baseline', async () => {
    Page.findById.mockReturnValue(lean(page()))
    Sub.find.mockReturnValue(subsQuery([]))
    Page.findOneAndUpdate.mockResolvedValue({ _id: PAGE_ID })
    const body = await (await GET({}, params)).json()
    const line = body.page.doc.lines[0]
    expect(line).toMatchObject({ id: 1, recheck: true, para_breaks: [2] })
    expect('polygon' in line).toBe(false)
    expect('baseline' in line).toBe(false)
    expect(body.page.revision).toBe(1)
  })

  it('פתיחה לעריכה מאריכה את ההחכרה ואינה מקצרת תפיסה של 48 שעות מרשת-העמודים', async () => {
    Page.findById.mockReturnValue(lean(page()))
    Sub.find.mockReturnValue(subsQuery([]))
    Page.findOneAndUpdate.mockResolvedValue({ _id: PAGE_ID })
    await GET({}, params)
    const [filter, update, opts] = Page.findOneAndUpdate.mock.calls[0]
    // רק עמוד פתוח שפנוי או שלי — $max לעולם לא פועל על החכרה של אחר
    expect(filter).toMatchObject({ status: 'open' })
    expect(filter.$or).toHaveLength(3)
    expect(Array.isArray(update)).toBe(true)
    expect(update[0].$set.leasedUntil.$max).toHaveLength(2)
    expect(opts).toMatchObject({ updatePipeline: true, lean: true })
  })

  it('לא ברצף שלי ואין הגשה ← 403 למתנדב', async () => {
    Page.findById.mockReturnValue(lean(page()))
    Sub.find.mockReturnValue(subsQuery([]))
    Page.findOneAndUpdate.mockResolvedValue(null)
    expect((await GET({}, params)).status).toBe(403)
  })
})
