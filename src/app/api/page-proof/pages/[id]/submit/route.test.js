import { describe, it, expect, vi, beforeEach } from 'vitest'

// הגשת עמוד בהגהת-עמודים: needsRecut וגרסת-העמוד נשמרים בהגשה, ותפיסת-המקום
// מותנית בגרסה. הפעולות מנוקות ונארזות (ops.packOps). המודלים מדומים.

const { getServerSessionMock, Sub, Page, drafts } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  Sub: { create: vi.fn(), find: vi.fn() },
  Page: { findById: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), find: vi.fn() },
  drafts: { dropDraft: vi.fn(), draftBasis: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/models/PageProofSubmission', () => ({ default: Sub }))
vi.mock('@/models/PageProofPage', () => ({ default: Page }))
vi.mock('@/models/PageProofBook', () => ({ default: {} }))
// הטיוטה בשרת (serverDrafts.js — נבדקת מול מסד אמיתי בבדיקות שלה)
vi.mock('@/lib/pageProof/serverDrafts', () => drafts)

import { POST } from './route'
import { MAX_BODY_BYTES } from '@/lib/pageProof/pool'

const PAGE_ID = '64b7f0c2a1b2c3d4e5f60002'
const USER_ID = '64b7f0c2a1b2c3d4e5f60003'
const lean = (v) => ({ lean: vi.fn().mockResolvedValue(v) })
const req = (body) => ({ json: vi.fn().mockResolvedValue(body) })
const params = { params: Promise.resolve({ id: PAGE_ID }) }
const volunteer = { user: { id: USER_ID, name: 'מתנדב', role: 'user', isVerified: true } }

const doc = { page: 3, size: [100, 100], lines: [{ id: 1, bbox: [10, 10, 90, 20], text: 'ישן' }, { id: 2, bbox: [10, 30, 90, 40], text: 'עוד' }] }
const pageRow = (extra = {}) => ({ _id: PAGE_ID, doc, gid: 'a1b2c3d4e5', page: 3, book: 'b1', required: 1, status: 'open', ...extra })
const CUT = [{ kind: 'line_split', page: 3, ids: [1], value: { x: 50 } }]
const TEXT = [{ kind: 'text', page: 3, ids: [2], value: 'חדש' }]

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue(volunteer)
  Page.findOneAndUpdate.mockResolvedValue({ activeCount: 1, required: 1 })
  Page.updateOne.mockResolvedValue({ matchedCount: 1 })
  Sub.create.mockResolvedValue({ _id: 'sub1' })
  Sub.find.mockReturnValue(lean([]))
  drafts.dropDraft.mockResolvedValue(1)
  drafts.draftBasis.mockResolvedValue({})
})

describe('POST /api/page-proof/pages/[id]/submit', () => {
  it('401 בלי session, 403 למשתמש לא מאומת', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await POST(req({ ops: TEXT }), params)).status).toBe(401)
    getServerSessionMock.mockResolvedValueOnce({ user: { id: USER_ID, role: 'user', isVerified: false } })
    expect((await POST(req({ ops: TEXT }), params)).status).toBe(403)
  })

  it('פעולות-חיתוך ← needsRecut=true וגרסת-העמוד נשמרים בהגשה', async () => {
    Page.findById.mockReturnValue(lean(pageRow({ revision: 2 })))
    const res = await POST(req({ ops: [...TEXT, ...CUT], revision: 2 }), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, submissionId: 'sub1', opCount: 2, needsRecut: true })
    expect(Sub.create.mock.calls[0][0]).toMatchObject({ needsRecut: true, revision: 2, opCount: 2 })
    // תפיסת-המקום מותנית בגרסה
    expect(Page.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ _id: PAGE_ID, status: 'open', revision: 2 })
    // הטיוטה שבשרת נמחקת (docs/63 §2)
    expect(drafts.dropDraft).toHaveBeenCalledWith(PAGE_ID)
  })

  it('טיוטה שהתחילה מהגשה קודמת (הבודק השני) — ההגשה נרשמת "מבוססת על" ההגשה ההיא', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    drafts.draftBasis.mockResolvedValueOnce({ basedOn: 'subPrev', basedOnName: 'מתנדב קודם', basedOnKind: 'submission' })
    expect((await POST(req({ ops: TEXT, revision: 1 }), params)).status).toBe(200)
    expect(Sub.create.mock.calls[0][0]).toMatchObject({ basedOn: 'subPrev', basedOnName: 'מתנדב קודם', basedOnKind: 'submission' })
  })

  it('כשל במחיקת הטיוטה אינו מכשיל הגשה שכבר נשמרה', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    drafts.dropDraft.mockRejectedValueOnce(new Error('db'))
    const res = await POST(req({ ops: TEXT, revision: 1 }), params)
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })

  it('בלי פעולות-חיתוך ← needsRecut=false; עמוד בלי שדה revision = גרסה 1 (גם בלי revision בבקשה)', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    const body = await (await POST(req({ ops: TEXT }), params)).json()
    expect(body.needsRecut).toBe(false)
    expect(Sub.create.mock.calls[0][0]).toMatchObject({ needsRecut: false, revision: 1 })
    expect(Page.findOneAndUpdate.mock.calls[0][0].revision).toEqual({ $in: [1, null] })
  })

  it('העמוד הוחלף מאז שנפתח (revision בבקשה שונה) ← 409 בלי לתפוס מקום', async () => {
    Page.findById.mockReturnValue(lean(pageRow({ revision: 2 })))
    const res = await POST(req({ ops: TEXT, revision: 1 }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/טענו אותו מחדש/)
    expect(Page.findOneAndUpdate).not.toHaveBeenCalled()
    expect(Sub.create).not.toHaveBeenCalled()
  })

  it('בקשה בלי revision (לשונית ישנה) על עמוד בגרסה 2 ← 409', async () => {
    Page.findById.mockReturnValue(lean(pageRow({ revision: 2 })))
    const res = await POST(req({ ops: TEXT }), params)
    expect(res.status).toBe(409)
    expect(Sub.create).not.toHaveBeenCalled()
  })

  it('revision תואם בבקשה ← ממשיך כרגיל', async () => {
    Page.findById.mockReturnValue(lean(pageRow({ revision: 2 })))
    expect((await POST(req({ ops: TEXT, revision: 2 }), params)).status).toBe(200)
  })

  it('שדות שהחוזה אינו מכיר יורדים; אישורי-השורות מאוחדים לפעולה אחת בסוף', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    const ops = [
      { kind: 'line_ok', page: 3, ids: [1], _g: 'g1', junk: 'x'.repeat(100) },
      { kind: 'text', page: 3, ids: [2], value: 'חדש', _c: 'text:2' },
      { kind: 'line_ok', page: 3, ids: [2], value: { junk: 1 } },
    ]
    const res = await POST(req({ ops }), params)
    expect(res.status).toBe(200)
    expect(Sub.create.mock.calls[0][0].ops).toEqual([
      { kind: 'text', page: 3, ids: [2], value: 'חדש' },
      { kind: 'line_ok', page: 3, ids: [1, 2] },
    ])
  })

  it('סגנון-תו עם טווח-מילים ענק ← 400 (אצלם הוא נפרש לרשימה)', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    const res = await POST(req({ ops: [{ kind: 'styles', page: 3, ids: [1], value: { style: 'b', words: [0, 2000000000], on: true } }] }), params)
    expect(res.status).toBe(400)
    expect(Sub.create).not.toHaveBeenCalled()
  })

  it('גוף גדול מדי ← 413 בלי לגשת למסד', async () => {
    const big = { headers: { get: () => String(MAX_BODY_BYTES + 1) }, json: vi.fn(), text: vi.fn() }
    const res = await POST(big, params)
    expect(res.status).toBe(413)
    expect(big.text).not.toHaveBeenCalled()
    const big2 = { headers: { get: () => null }, text: vi.fn().mockResolvedValue('x'.repeat(MAX_BODY_BYTES + 1)) }
    expect((await POST(big2, params)).status).toBe(413)
    expect(Page.findById).not.toHaveBeenCalled()
  })

  it('העמוד מלא ← done רק אם עדיין open (לא דורס recut שנקבע בינתיים)', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    await POST(req({ ops: TEXT }), params)
    expect(Page.updateOne).toHaveBeenCalledWith({ _id: PAGE_ID, status: 'open', activeCount: { $gte: 1 } }, { $set: { status: 'done' } })
  })

  it('עמוד כפול שהתמלא, וההגשה הראשית שכבר אושרה לו משנה חיתוך ← recut (האישור חיכה להגשה האחרונה)', async () => {
    Page.findById.mockReturnValue(lean(pageRow({ required: 2 })))
    Page.findOneAndUpdate.mockResolvedValue({ activeCount: 2, required: 2 })
    Sub.find.mockReturnValue(lean([{ _id: 'a', needsRecut: true, exportedAt: null, reviewedAt: new Date('2026-09-29') }]))
    await POST(req({ ops: TEXT }), params)
    expect(Sub.find.mock.calls[0][0]).toMatchObject({ page: PAGE_ID, status: 'approved' })
    expect(Page.updateOne).toHaveBeenCalledWith({ _id: PAGE_ID, status: 'open', activeCount: { $gte: 2 } }, { $set: { status: 'recut' } })
  })

  it('תפיסה נכשלה (הוגש/נלקח) ← 409; העמוד ממתין לזיהוי-מחדש ← הסבר משלו', async () => {
    Page.findById.mockReturnValueOnce(lean(pageRow())).mockReturnValueOnce(lean({ status: 'open', revision: 1 }))
    Page.findOneAndUpdate.mockResolvedValueOnce(null)
    let res = await POST(req({ ops: TEXT }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/כבר הוגש או נלקח/)
    Page.findById.mockReturnValueOnce(lean(pageRow())).mockReturnValueOnce(lean({ status: 'recut', revision: 1 }))
    Page.findOneAndUpdate.mockResolvedValueOnce(null)
    res = await POST(req({ ops: TEXT }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/זיהוי-מחדש/)
    expect(Sub.create).not.toHaveBeenCalled()
  })

  it('עמוד שהמנהל סגר: מתקבל רק ממי שמחזיק בו; מאחר ← 409 עם הסבר', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    await POST(req({ ops: TEXT }), params)
    // מי שמחזיק (גם אחרי שהתפיסה פגה) — תמיד; עמוד פנוי — רק כשהוא פתוח למתנדבים
    const [holder, freeNull, freeExpired] = Page.findOneAndUpdate.mock.calls[0][0].$or
    expect(String(holder.leasedBy)).toBe(USER_ID)
    expect(holder.volunteer).toBeUndefined()
    expect(freeNull).toMatchObject({ leasedUntil: null, volunteer: { $ne: false } })
    expect(freeExpired).toMatchObject({ volunteer: { $ne: false } })
    expect(freeExpired.leasedUntil.$lt).toBeInstanceOf(Date)

    vi.clearAllMocks()
    getServerSessionMock.mockResolvedValue(volunteer)
    Page.findById.mockReturnValueOnce(lean(pageRow())).mockReturnValueOnce(lean({ status: 'open', revision: 1, volunteer: false, leasedBy: null }))
    Page.findOneAndUpdate.mockResolvedValueOnce(null)
    const res = await POST(req({ ops: TEXT }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/מנהל סגר את העמוד להגהה.*העבודה שמורה בדפדפן/)
    expect(Sub.create).not.toHaveBeenCalled()
  })
})

// קישור לעמוד אחר (link_add שהצד השני שלו — שורה 77 — בעמוד 4 של אותו ספר)
describe('POST submit — קישור לעמוד אחר', () => {
  const far = (value = {}) => [
    { kind: 'link_add', page: 3, ids: [2, 77], value: { from_words: [0, 0], to_words: [0, 0], kind: 'note', to_page: 4, to_line_no: 99, to_text: 'מה שהדפדפן שלח', ...value } },
  ]
  const other = (lines) => Page.find.mockReturnValue(lean([{ page: 4, doc: { lines } }]))

  it('השורה אכן בעמוד 4 של הספר ← ההגשה נשמרת; מספר-השורה ותחילת-הטקסט — מהעמוד השמור', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    other([{ id: 77, line_no: 11, stream: 'main', text: 'ב ועוד נראה' }])
    const res = await POST(req({ ops: far() }), params)
    expect(res.status).toBe(200)
    expect(Page.find.mock.calls[0][0]).toEqual({ gid: 'a1b2c3d4e5', page: { $in: [4] } })
    const saved = Sub.create.mock.calls[0][0].ops
    expect(saved).toEqual([
      { kind: 'link_add', page: 3, ids: [2, 77], value: { kind: 'note', to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה', from_words: [0, 0], to_words: [0, 0] } },
    ])
  })

  it('השורה אינה בעמוד ההוא / הוסרה שם / ריהוט / העמוד אינו בספר ← 400 בעברית, בלי לתפוס מקום', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    for (const [lines, msg] of [
      [[{ id: 78, line_no: 0, stream: 'main', text: 'אחרת' }], /השורה שנבחרה אינה בעמוד ההוא/],
      [[{ id: 77, line_no: 0, stream: 'main', status: 'removed', text: 'x' }], /השורה שנבחרה אינה בעמוד ההוא/],
      [[{ id: 77, line_no: 0, stream: 'header', text: '12' }], /ריהוט הדף/],
    ]) {
      other(lines)
      const res = await POST(req({ ops: far() }), params)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(msg)
    }
    Page.find.mockReturnValue(lean([]))
    const res = await POST(req({ ops: far() }), params)
    expect((await res.json()).error).toMatch(/העמוד הזה אינו בספר/)
    expect(Page.findOneAndUpdate).not.toHaveBeenCalled()
    expect(Sub.create).not.toHaveBeenCalled()
  })

  it('בלי הצהרה על העמוד ← "שורה שאינה בעמוד הזה" (בלי לחפש בעמודים אחרים)', async () => {
    Page.findById.mockReturnValue(lean(pageRow()))
    const res = await POST(req({ ops: far({ to_page: undefined }) }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('פעולה 1: שורה שאינה בעמוד הזה')
    expect(Page.find).not.toHaveBeenCalled()
  })
})
