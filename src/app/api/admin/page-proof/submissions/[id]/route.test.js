import { describe, it, expect, vi, beforeEach } from 'vitest'

// אישור/דחייה של הגשה בהגהת-עמודים: לולאת הזיהוי-מחדש (מצב 'recut'), ההגשה
// הראשית (אותו כלל של קובץ-התיקונים), עמוד כפול שעוד חסרה לו הגשה, הגנת-הגרסה
// ושחרור ממתנה. המודלים מדומים — הבדיקה היא של ההחלטות והעדכונים שהראוט שולח.

const { getServerSessionMock, Sub, Page } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  Sub: { findById: vi.fn(), findOneAndUpdate: vi.fn(), find: vi.fn(), updateMany: vi.fn() },
  Page: { findById: vi.fn(), updateOne: vi.fn(), find: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/models/PageProofSubmission', () => ({ default: Sub }))
vi.mock('@/models/PageProofPage', () => ({ default: Page }))
vi.mock('@/models/PageProofBook', () => ({ default: { findById: vi.fn() } }))

import { PATCH } from './route'

const SUB_ID = '64b7f0c2a1b2c3d4e5f60001'
const PAGE_ID = '64b7f0c2a1b2c3d4e5f60002'
const USER_ID = '64b7f0c2a1b2c3d4e5f60003'
const lean = (v) => ({ lean: vi.fn().mockResolvedValue(v) })
const req = (body) => ({ json: vi.fn().mockResolvedValue(body) })
const params = { params: Promise.resolve({ id: SUB_ID }) }
const admin = { user: { id: USER_ID, name: 'מנהל', role: 'admin_ocr' } }

const CUT = [{ kind: 'line_split', page: 3, ids: [1], value: { x: 20 } }]
const TEXT = [{ kind: 'text', page: 3, ids: [1], value: 'חדש' }]
const doc = { page: 3, size: [100, 100], lines: [{ id: 1, bbox: [10, 10, 90, 20], text: 'ישן' }, { id: 2, bbox: [10, 30, 90, 40], text: 'עוד' }] }
const page = (extra = {}) => ({ _id: PAGE_ID, status: 'done', activeCount: 1, required: 1, ...extra })
// ההגשות המאושרות שהראוט רואה (primaryOf) — אחרי האישור, כולל זו
const approved = (...subs) => Sub.find.mockReturnValue(lean(subs))
const sub = (extra = {}) => ({ _id: SUB_ID, page: PAGE_ID, user: USER_ID, status: 'submitted', ops: TEXT, ...extra })
const statusCall = () => Page.updateOne.mock.calls.find(([, u]) => u.$set?.status)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSessionMock.mockResolvedValue(admin)
  Page.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
  Sub.find.mockReturnValue(lean([]))
  Sub.updateMany.mockResolvedValue({ modifiedCount: 0 })
})

describe('הרשאות', () => {
  it('401 בלי session, 403 בלי הרשאת OCR', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await PATCH(req({ action: 'approve' }), params)).status).toBe(401)
    getServerSessionMock.mockResolvedValueOnce({ user: { role: 'admin_books' } })
    expect((await PATCH(req({ action: 'approve' }), params)).status).toBe(403)
  })
})

describe('אישור', () => {
  it('הגשה שמשנה חיתוך (והיא הראשית) ← העמוד עובר ל-recut (וההחכרה מתנקה), needsRecut נשמר', async () => {
    Sub.findById.mockReturnValue(lean(sub({ ops: CUT })))
    Page.findById.mockReturnValue(lean(page()))
    Sub.findOneAndUpdate.mockResolvedValue({ opCount: 1 })
    approved({ _id: SUB_ID, needsRecut: true, reviewedAt: new Date() })

    const res = await PATCH(req({ action: 'approve' }), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, status: 'approved', needsRecut: true, recutSkipped: false, pageStatus: 'recut' })
    expect(Sub.findOneAndUpdate.mock.calls[0][1].$set.needsRecut).toBe(true)
    expect(Page.updateOne).toHaveBeenCalledWith({ _id: PAGE_ID, revision: { $in: [1, null] } }, { $inc: { approvedCount: 1 } })
    const [filter, update] = statusCall()
    // מותנה במצב שנקרא — לא דורס שינוי מקביל
    expect(filter).toMatchObject({ _id: PAGE_ID, revision: { $in: [1, null] }, status: 'done' })
    expect(update).toEqual({ $set: { status: 'recut', leasedBy: null, leasedUntil: null } })
  })

  it('הגשה בלי שינוי-חיתוך ← רק מונה-האישורים, המצב לא משתנה (מעבר שני, גרסה 2)', async () => {
    Sub.findById.mockReturnValue(lean(sub({ revision: 2 })))
    Page.findById.mockReturnValue(lean(page({ revision: 2 })))
    Sub.findOneAndUpdate.mockResolvedValue({ opCount: 1 })
    approved({ _id: SUB_ID, needsRecut: false, reviewedAt: new Date() })

    const body = await (await PATCH(req({ action: 'approve' }), params)).json()
    expect(body).toMatchObject({ needsRecut: false, pageStatus: 'done' })
    expect(Page.updateOne).toHaveBeenCalledWith({ _id: PAGE_ID, revision: 2 }, { $inc: { approvedCount: 1 } })
    expect(statusCall()).toBeUndefined()
  })

  it('המנהל ערך את הפעולות — ההחלטה לפי הפעולות הסופיות (הוסיף פיצול), והן מנוקות ונארזות', async () => {
    Sub.findById.mockReturnValue(lean(sub()))
    Page.findById.mockReturnValue(lean(page({ status: 'open', doc })))
    Sub.findOneAndUpdate.mockImplementation(async (_f, u) => ({ opCount: u.$set.ops.length }))
    approved({ _id: SUB_ID, needsRecut: true, reviewedAt: new Date() })

    const edited = [{ kind: 'line_ok', page: 3, ids: [2], junk: 1 }, ...TEXT, ...CUT]
    const body = await (await PATCH(req({ action: 'approve', ops: edited }), params)).json()
    expect(body).toMatchObject({ needsRecut: true, pageStatus: 'recut', opCount: 3 })
    const set = Sub.findOneAndUpdate.mock.calls[0][1].$set
    expect(set).toMatchObject({ reviewerEdited: true, needsRecut: true })
    expect(set.ops.at(-1)).toEqual({ kind: 'line_ok', page: 3, ids: [2] })
    expect(statusCall()[1].$set.status).toBe('recut')
  })

  // סקירה: גם לקוח ששולח את הפעולות עם השדות הפנימיים — סימון "לספר בלבד" אוטומטי (_cmp) על שורה שהטקסט שלה
  // חזר בסוף לזה שיובא יורד, כמו בהגשה; סימון ידני נשאר
  it('המנהל ערך — סימון "לספר בלבד" אוטומטי בלי שינוי-טקסט יורד, ידני נשאר', async () => {
    Sub.findById.mockReturnValue(lean(sub()))
    Page.findById.mockReturnValue(lean(page({ status: 'open', doc })))
    Sub.findOneAndUpdate.mockImplementation(async (_f, u) => ({ opCount: u.$set.ops.length }))
    const edited = [
      { kind: 'train_text', page: 3, ids: [1], value: 0, _cmp: true },
      { kind: 'text', page: 3, ids: [1], value: 'ישן' },
      { kind: 'train_text', page: 3, ids: [2], value: 0 },
    ]
    const body = await (await PATCH(req({ action: 'approve', ops: edited }), params)).json()
    expect(body.success).toBe(true)
    const set = Sub.findOneAndUpdate.mock.calls[0][1].$set
    expect(set.ops.filter((o) => o.kind === 'train_text')).toEqual([{ kind: 'train_text', page: 3, ids: [2], value: 0 }])
  })

  it('עמוד כפול שעוד חסרה לו הגשה ← נשאר פתוח (הבודק השני ממשיך); ההחכרה לא נמחקת', async () => {
    Sub.findById.mockReturnValue(lean(sub({ ops: CUT })))
    Page.findById.mockReturnValue(lean(page({ status: 'open', activeCount: 1, required: 2 })))
    Sub.findOneAndUpdate.mockResolvedValue({ opCount: 1 })
    approved({ _id: SUB_ID, needsRecut: true, reviewedAt: new Date() })

    const body = await (await PATCH(req({ action: 'approve' }), params)).json()
    expect(body).toMatchObject({ needsRecut: true, pageStatus: 'open' })
    expect(statusCall()).toBeUndefined()
  })

  it('הגשה אחרת לעמוד כבר יצאה בקובץ הראשי ← לא recut; recutSkipped (תיקוני-החיתוך ייצאו בקובץ הכפולים)', async () => {
    Sub.findById.mockReturnValue(lean(sub({ ops: CUT })))
    Page.findById.mockReturnValue(lean(page()))
    Sub.findOneAndUpdate.mockResolvedValue({ opCount: 1 })
    approved(
      { _id: 'other', needsRecut: false, exportedAt: new Date('2026-09-29T10:30:00Z'), reviewedAt: new Date('2026-09-29T10:00:00Z') },
      { _id: SUB_ID, needsRecut: true, reviewedAt: new Date('2026-09-29T11:00:00Z') }
    )

    const body = await (await PATCH(req({ action: 'approve' }), params)).json()
    expect(body).toMatchObject({ needsRecut: true, recutSkipped: true, pageStatus: 'done' })
    expect(statusCall()).toBeUndefined()
  })

  it('המצב השתנה בינתיים (עדכון מותנה לא תפס) ← נקרא שוב ומחושב מחדש', async () => {
    Sub.findById.mockReturnValue(lean(sub({ ops: CUT })))
    Page.findById.mockReturnValueOnce(lean(page({ status: 'open' }))).mockReturnValueOnce(lean(page({ status: 'done' })))
    Sub.findOneAndUpdate.mockResolvedValue({ opCount: 1 })
    approved({ _id: SUB_ID, needsRecut: true, reviewedAt: new Date() })
    Page.updateOne
      .mockResolvedValueOnce({ matchedCount: 1 }) // $inc
      .mockResolvedValueOnce({ matchedCount: 0 }) // open → recut: לא תפס
      .mockResolvedValueOnce({ matchedCount: 1 }) // done → recut

    const body = await (await PATCH(req({ action: 'approve' }), params)).json()
    expect(body.pageStatus).toBe('recut')
    const statusCalls = Page.updateOne.mock.calls.filter(([, u]) => u.$set?.status)
    expect(statusCalls.map(([f]) => f.status)).toEqual(['open', 'done'])
  })

  it('הגשה על גרסה קודמת של עמוד שכבר הוחלף — מאושרת בלי לגעת בעמוד', async () => {
    Sub.findById.mockReturnValue(lean(sub({ ops: CUT })))
    Page.findById.mockReturnValue(lean(page({ status: 'open', revision: 2 })))
    Sub.findOneAndUpdate.mockResolvedValue({ opCount: 1 })

    const body = await (await PATCH(req({ action: 'approve' }), params)).json()
    expect(body).toMatchObject({ success: true, status: 'approved', needsRecut: true, pageStatus: 'open' })
    expect(Page.updateOne).not.toHaveBeenCalled()
  })

  it('הגשה שכבר טופלה ← 409, בלי עדכון עמוד', async () => {
    Sub.findById.mockReturnValue(lean(sub({ status: 'approved', ops: CUT })))
    Page.findById.mockReturnValue(lean(page({ status: 'recut' })))
    Sub.findOneAndUpdate.mockResolvedValue(null)
    expect((await PATCH(req({ action: 'approve' }), params)).status).toBe(409)
    expect(Page.updateOne).not.toHaveBeenCalled()
  })
})

describe('דחייה', () => {
  it('עמוד שממתין לזיהוי-מחדש נשאר recut כשההגשה הראשית שנשארה משנה חיתוך', async () => {
    Sub.findById.mockReturnValue(lean(sub()))
    Sub.findOneAndUpdate.mockResolvedValue({ _id: SUB_ID, status: 'submitted' })
    Page.findById.mockReturnValue(lean(page({ status: 'recut' })))
    approved({ _id: 'other', needsRecut: true, reviewedAt: new Date() })

    const res = await PATCH(req({ action: 'reject' }), params)
    expect(res.status).toBe(200)
    expect(Sub.find.mock.calls[0][0]).toMatchObject({ page: PAGE_ID, status: 'approved', _id: { $ne: SUB_ID } })
    const [filter, update] = Page.updateOne.mock.calls[0]
    expect(filter).toMatchObject({ _id: PAGE_ID, status: 'recut' })
    expect(update.$set).toEqual({ status: 'recut' })
    expect(update.$inc).toEqual({ activeCount: -1 })
  })

  it('ביטול האישור של ההגשה שגרמה ל-recut ← העמוד חוזר ל-open', async () => {
    Sub.findById.mockReturnValue(lean(sub({ status: 'approved', ops: CUT })))
    Sub.findOneAndUpdate.mockResolvedValue({ _id: SUB_ID, status: 'approved', exportedAt: null })
    Page.findById.mockReturnValue(lean(page({ status: 'recut' })))

    const body = await (await PATCH(req({ action: 'reject' }), params)).json()
    const update = Page.updateOne.mock.calls[0][1]
    expect(update.$set).toEqual({ status: 'open' })
    expect(update.$inc).toEqual({ activeCount: -1, approvedCount: -1 })
    expect(body.pageStatus).toBe('open')
  })

  it('דחייה שנתקלה באישור מקביל (העמוד עבר ל-recut בינתיים) — לא דורסת אותו', async () => {
    Sub.findById.mockReturnValue(lean(sub()))
    Sub.findOneAndUpdate.mockResolvedValue({ _id: SUB_ID, status: 'submitted' })
    Page.findById.mockReturnValueOnce(lean(page({ status: 'done' }))).mockReturnValueOnce(lean(page({ status: 'recut' })))
    approved({ _id: 'other', needsRecut: true, reviewedAt: new Date() })
    Page.updateOne.mockResolvedValueOnce({ matchedCount: 0 }).mockResolvedValueOnce({ matchedCount: 1 })

    const body = await (await PATCH(req({ action: 'reject' }), params)).json()
    const calls = Page.updateOne.mock.calls
    expect(calls.map(([f]) => f.status)).toEqual(['done', 'recut'])
    expect(calls[1][1].$set).toEqual({ status: 'recut' })
    expect(body.pageStatus).toBe('recut')
  })

  it('הגשה על גרסה קודמת — נדחית בלי לגעת במונים של העמוד החדש', async () => {
    Sub.findById.mockReturnValue(lean(sub({ status: 'approved', ops: CUT })))
    Sub.findOneAndUpdate.mockResolvedValue({ _id: SUB_ID, status: 'approved', exportedAt: null })
    Page.findById.mockReturnValue(lean(page({ status: 'open', revision: 2 })))

    const res = await PATCH(req({ action: 'reject' }), params)
    expect(res.status).toBe(200)
    expect(Page.updateOne).not.toHaveBeenCalled()
  })

  it('הגשה שכבר יצאה בקובץ-תיקונים ← 409', async () => {
    Sub.findById.mockReturnValue(lean(sub({ status: 'approved', ops: CUT })))
    Sub.findOneAndUpdate.mockResolvedValue(null)
    expect((await PATCH(req({ action: 'reject' }), params)).status).toBe(409)
  })
})

describe('שחרור ממתנה לזיהוי-מחדש', () => {
  it('עמוד שממתין ← נסגר בלי זיהוי-מחדש (הושלם); עמוד כפול שחסרה לו הגשה ← פתוח', async () => {
    Sub.findById.mockReturnValue(lean(sub({ status: 'approved', ops: CUT })))
    Page.findById.mockReturnValue(lean(page({ status: 'recut' })))
    let body = await (await PATCH(req({ action: 'release_recut' }), params)).json()
    expect(body).toMatchObject({ success: true, pageStatus: 'done' })
    expect(Page.updateOne.mock.calls[0]).toEqual([{ _id: PAGE_ID, status: 'recut', revision: { $in: [1, null] } }, { $set: { status: 'done' } }])
    Page.findById.mockReturnValue(lean(page({ status: 'recut', activeCount: 1, required: 2 })))
    body = await (await PATCH(req({ action: 'release_recut' }), params)).json()
    expect(body.pageStatus).toBe('open')
  })

  it('בקשת מתנדב לזיהוי-מחדש: מתבטלת והעמוד חוזר אליו (48 שעות); "דחייה" שלה — 409 בלי לגעת במונים', async () => {
    Sub.findById.mockReturnValue(lean(sub({ status: 'approved', ops: CUT, recutRequest: true })))
    Page.findById.mockReturnValue(lean(page({ status: 'recut', activeCount: 0, required: 1 })))
    // recutRequesterOf — הבקשה הממתינה של העמוד
    Sub.find.mockReturnValue(lean([{ _id: SUB_ID, user: USER_ID, status: 'approved', recutRequest: true, recutDoneAt: null, createdAt: new Date() }]))
    Sub.updateMany.mockResolvedValue({ modifiedCount: 1 })
    const body = await (await PATCH(req({ action: 'release_recut' }), params)).json()
    expect(body).toMatchObject({ success: true, status: 'rejected', pageStatus: 'open', canceledRequests: 1, returnedToRequester: true })
    const [filter, update] = Page.updateOne.mock.calls[0]
    expect(filter).toEqual({ _id: PAGE_ID, status: 'recut', revision: { $in: [1, null] } })
    expect(update.$set).toMatchObject({ status: 'open', leasedBy: USER_ID })
    expect(update.$set.leasedUntil.getTime() - Date.now()).toBeGreaterThan(47.9 * 3600e3)
    const [cancelFilter, cancel] = Sub.updateMany.mock.calls[0]
    expect(cancelFilter).toMatchObject({ recutRequest: true, status: 'approved', recutDoneAt: null, revision: { $in: [1, null] } })
    expect(cancel.$set).toMatchObject({ status: 'rejected', reviewedByName: 'מנהל' })

    vi.clearAllMocks()
    getServerSessionMock.mockResolvedValue(admin)
    Sub.findById.mockReturnValue(lean(sub({ status: 'approved', ops: CUT, recutRequest: true })))
    const rej = await PATCH(req({ action: 'reject' }), params)
    expect(rej.status).toBe(409)
    expect((await rej.json()).error).toMatch(/שחרור מהמתנה/)
    expect(Sub.findOneAndUpdate).not.toHaveBeenCalled()
    expect(Page.updateOne).not.toHaveBeenCalled()
  })

  it('עמוד שאינו ממתין ← 409', async () => {
    Sub.findById.mockReturnValue(lean(sub({ status: 'approved' })))
    Page.findById.mockReturnValue(lean(page({ status: 'done' })))
    expect((await PATCH(req({ action: 'release_recut' }), params)).status).toBe(409)
    expect(Page.updateOne).not.toHaveBeenCalled()
  })
})

describe('אישור עם עריכה — קישור לעמוד אחר', () => {
  const far = [{ kind: 'link_add', page: 3, ids: [2, 77], value: { from_words: [0, 0], to_words: [0, 0], kind: 'dh', to_page: 4 } }]

  it('השורה בעמוד 4 של אותו ספר ← נשמר, עם מספר-השורה ותחילת-הטקסט מהעמוד השמור', async () => {
    Sub.findById.mockReturnValue(lean(sub()))
    Page.findById.mockReturnValue(lean(page({ status: 'open', doc, gid: 'g1' })))
    Page.find.mockReturnValue(lean([{ page: 4, doc: { lines: [{ id: 77, line_no: 11, stream: 'main', text: 'ב ועוד נראה' }] } }]))
    Sub.findOneAndUpdate.mockImplementation(async (_f, u) => ({ opCount: u.$set.ops.length }))
    const res = await PATCH(req({ action: 'approve', ops: far }), params)
    expect(res.status).toBe(200)
    // ה-gid נקרא יחד עם העמוד — הקישור נבדק רק בעמודי אותו ספר
    expect(Page.findById.mock.calls[0][1]).toMatchObject({ doc: 1, gid: 1 })
    expect(Page.find.mock.calls[0][0]).toEqual({ gid: 'g1', page: { $in: [4] } })
    expect(Sub.findOneAndUpdate.mock.calls[0][1].$set.ops).toEqual([
      { kind: 'link_add', page: 3, ids: [2, 77], value: { kind: 'dh', to_page: 4, to_line_no: 11, to_text: 'ב ועוד נראה', from_words: [0, 0], to_words: [0, 0] } },
    ])
  })

  it('השורה אינה שם ← 400, ההגשה לא מאושרת', async () => {
    Sub.findById.mockReturnValue(lean(sub()))
    Page.findById.mockReturnValue(lean(page({ status: 'open', doc, gid: 'g1' })))
    Page.find.mockReturnValue(lean([{ page: 4, doc: { lines: [] } }]))
    const res = await PATCH(req({ action: 'approve', ops: far }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/קישור לעמוד 4/)
    expect(Sub.findOneAndUpdate).not.toHaveBeenCalled()
  })
})
