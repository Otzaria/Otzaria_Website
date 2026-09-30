import { describe, it, expect, vi, beforeEach } from 'vitest'

// /api/page-proof: הרצף של המתנדב. ?page=<id> — פתיחה מרשת-העמודים (הרצף של
// העמוד הזה, אם הוא של המשתמש/פנוי לו); "רצף אחר" משחרר רק את הרצף הנוכחי.
// המודלים מדומים.

const { getServerSessionMock, Page, Book, Sub } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  Page: { findOne: vi.fn(), find: vi.fn(), updateMany: vi.fn(), countDocuments: vi.fn(), aggregate: vi.fn() },
  Book: { findById: vi.fn(), find: vi.fn() },
  Sub: { find: vi.fn(), aggregate: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/models/PageProofSubmission', () => ({ default: Sub }))
vi.mock('@/models/PageProofPage', () => ({ default: Page }))
vi.mock('@/models/PageProofBook', () => ({ default: Book }))

import { GET, POST } from './route'

const USER_ID = '64b7f0c2a1b2c3d4e5f60003'
const PAGE_ID = '64b7f0c2a1b2c3d4e5f60002'
const BOOK_ID = '64b7f0c2a1b2c3d4e5f60009'
// שאילתה שרשרתית (sort/lean) שמחזירה v
const chain = (v) => {
  const q = { sort: vi.fn(() => q), lean: vi.fn().mockResolvedValue(v) }
  return q
}
const volunteer = { user: { id: USER_ID, name: 'מתנדב', role: 'user', isVerified: true } }
const getReq = (qs = '') => ({ url: `http://x/api/page-proof${qs}` })
const postReq = (body) => ({ json: vi.fn().mockResolvedValue(body) })

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue(volunteer)
  Book.findById.mockReturnValue(chain({ _id: BOOK_ID, gid: 'abcdefgh12', title: 'ספר', script: 'square' }))
  Page.find.mockReturnValue(chain([{ _id: PAGE_ID, page: 12, lineCount: 30, leasedBy: USER_ID, leasedUntil: new Date(Date.now() + 3600e3), revision: 1 }]))
  Sub.find.mockReturnValue(chain([]))
  Page.countDocuments.mockResolvedValue(0)
  Sub.aggregate.mockResolvedValue([])
  Page.updateMany.mockResolvedValue({ modifiedCount: 2 })
})

describe('GET /api/page-proof?page=', () => {
  it('עמוד שמוחכר למשתמש / פנוי לו ← הרצף שלו (בלי לחלק רצף חדש)', async () => {
    Page.findOne.mockReturnValueOnce(chain({ book: BOOK_ID, seq: 2 }))
    const res = await GET(getReq(`?page=${PAGE_ID}`))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.sequence).toMatchObject({ seq: 2, book: { id: BOOK_ID }, pages: [{ id: PAGE_ID, page: 12, state: 'mine' }] })
    expect(Page.findOne).toHaveBeenCalledTimes(1)
    const filter = Page.findOne.mock.calls[0][0]
    expect(String(filter._id)).toBe(PAGE_ID)
    // לעולם לא עמוד שמתנדב אחר מחזיק: שלי / הגשתי / פתוח ופנוי
    expect(filter.$or).toHaveLength(3)
    expect(filter.$or[2]).toMatchObject({ status: 'open' })
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('עמוד שאחר מחזיק (או מזהה לא תקין) ← רצף רגיל במקומו', async () => {
    // sequenceOfPage לא מצא; ואז claimSequence — הרצף שהמשתמש כבר מחזיק
    Page.findOne.mockReturnValueOnce(chain(null)).mockReturnValueOnce(chain({ book: BOOK_ID, seq: 5 }))
    const body = await (await GET(getReq(`?page=${PAGE_ID}`))).json()
    expect(body.sequence.seq).toBe(5)
    expect(Page.findOne).toHaveBeenCalledTimes(2)
    // הרצף המוחזק — זה שההחכרה שלו נגמרת ראשונה
    expect(Page.findOne.mock.results[1].value.sort).toHaveBeenCalledWith({ leasedUntil: 1, _id: 1 })

    vi.clearAllMocks()
    Page.findOne.mockReturnValueOnce(chain({ book: BOOK_ID, seq: 1 }))
    Book.findById.mockReturnValue(chain({ _id: BOOK_ID, gid: 'abcdefgh12', title: 'ספר' }))
    Page.find.mockReturnValue(chain([]))
    Sub.find.mockReturnValue(chain([]))
    Sub.aggregate.mockResolvedValue([])
    await GET(getReq('?page=not-an-id'))
    // מזהה לא תקין — ישר לחלוקה הרגילה
    expect(Page.findOne.mock.calls[0][0]).toMatchObject({ status: 'open' })
  })
})

describe('POST /api/page-proof (רצף אחר)', () => {
  it('עם book+seq ← משחרר רק את הרצף הזה', async () => {
    const res = await POST(postReq({ action: 'release', book: BOOK_ID, seq: 3 }))
    expect(res.status).toBe(200)
    const filter = Page.updateMany.mock.calls[0][0]
    expect(String(filter.leasedBy)).toBe(USER_ID)
    expect(String(filter.book)).toBe(BOOK_ID)
    expect(filter.seq).toBe(3)
    expect(Page.updateMany.mock.calls[0][1]).toEqual({ $set: { leasedBy: null, leasedUntil: null } })
  })

  it('בלי book/seq (לקוח ישן) ← כל ההחכרות של המשתמש, כמו קודם; פעולה לא מוכרת ← 400', async () => {
    await POST(postReq({ action: 'release' }))
    expect(Object.keys(Page.updateMany.mock.calls[0][0])).toEqual(['leasedBy'])
    expect((await POST(postReq({ action: 'nope' }))).status).toBe(400)
  })
})
