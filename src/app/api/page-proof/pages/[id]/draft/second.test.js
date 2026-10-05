// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// הבודק השני (docs/63 §4) דרך הראוטים: עמוד כפול שמתנדב א' הגיש ← מתנדב ב' תופס ופותח: הטיוטה ההתחלתית שלו = הפעולות
// של א', מסומנות (inherited, "מבוססת על"); ההגשה של ב' מלאה ונרשמת basedOn; בסקירת-המנהל — "מבוססת על הגשה X" ומה
// השתנה מעבר לה; בקובץ-התיקונים — same_as לכל פעולה זהה (תוכנת-הספר לא תחיל פעמיים).

const { getServerSessionMock, rateMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn(), rateMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateMock }))

import User from '@/models/User'
import PageProofBook from '@/models/PageProofBook'
import PageProofPage from '@/models/PageProofPage'
import PageProofDraft from '@/models/PageProofDraft'
import PageProofSubmission from '@/models/PageProofSubmission'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { PUT } from './route'
import { GET as pageGET } from '../route'
import { POST as submitPOST } from '../submit/route'
import { POST as claimPOST } from '../claim/route'
import { GET as subGET, PATCH as subPATCH } from '@/app/api/admin/page-proof/submissions/[id]/route'
import { GET as fixesGET } from '@/app/api/admin/page-proof/books/[gid]/fixes/route'
import { GET as bookSubsGET } from '@/app/api/admin/page-proof/books/[gid]/submissions/route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const GID = 'gSecondRev1'
const line = (id, extra = {}) => ({ id, line_no: id - 1, order: id, bbox: [100, id * 60, 900, id * 60 + 40], text: `שורה ${id}`, status: 'pending', stream: 'main', ...extra })
const DOC = { page: 4, revision: 1, size: [1000, 2000], lines: [line(1), line(2), line(3)] }
const TEXT1 = { kind: 'text', page: 4, ids: [1], value: 'שורה 1 בתיקון של א' }
const PARA2 = { kind: 'para', page: 4, ids: [2], value: 'h2' }
const STREAM3 = { kind: 'stream', page: 4, ids: [3], value: 'notes' }
const TEXT2 = { kind: 'text', page: 4, ids: [2], value: 'שורה 2 בתיקון של ב' }

let a
let b
let admin
let page

const as = (u) =>
  getServerSessionMock.mockResolvedValue({ user: { id: String(u._id), _id: String(u._id), name: u.name, role: u.role || 'user', isVerified: true } })
const req = (method, body, url = 'http://localhost/api/x') => new Request(url, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
const p = (o) => ({ params: Promise.resolve(o) })
const pid = () => String(page._id)
const open = async () => (await pageGET(req('GET'), p({ id: pid() }))).json()
const submit = async (ops) => (await submitPOST(req('POST', { revision: 1, ops }), p({ id: pid() }))).json()
const review = async (id) => (await subGET(req('GET'), p({ id }))).json()
const patch = async (id, action) => (await subPATCH(req('PATCH', { action }), p({ id }))).json()
const fixes = async (q = '') => JSON.parse(await (await fixesGET(req('GET', null, `http://localhost/api/admin/page-proof/books/${GID}/fixes${q}`), p({ gid: GID }))).text())

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  rateMock.mockReturnValue(true)
  a = await User.create({ name: 'מתנדב א', email: 'a@example.org', password: 'x', isVerified: true })
  b = await User.create({ name: 'מתנדב ב', email: 'b@example.org', password: 'x', isVerified: true })
  admin = await User.create({ name: 'מנהלת', email: 'm@example.org', password: 'x', role: 'admin_ocr' })
  const book = await PageProofBook.create({ gid: GID, title: 'ספר', script: 'square' })
  page = await PageProofPage.create({
    book: book._id,
    gid: GID,
    page: 4,
    seq: 0,
    required: 2,
    doc: DOC,
    lineCount: 3,
    imagePath: '/uploads/books/x/page.4.jpg',
    leasedBy: a._id,
    leasedUntil: new Date(Date.now() + 5 * 3600e3),
  })
  // מתנדב א' מגיש — העמוד ממתין לבודק נוסף
  as(a)
  const r = await submit([TEXT1, PARA2, STREAM3])
  expect(r.success).toBe(true)
  expect(await PageProofPage.findById(page._id).lean()).toMatchObject({ status: 'open', activeCount: 1 })
})

describe('הבודק השני', () => {
  it('מתחיל מהגרסה של המתנדב הקודם — מסומנת; מגיש הגשה מלאה שנרשמת "מבוססת על"; המנהל רואה מה השתנה מעבר לה', async () => {
    const subA = await PageProofSubmission.findOne({ user: a._id }).lean()
    as(b)
    expect((await claimPOST(req('POST'), p({ id: pid() }))).status).toBe(200)
    const got = await open()
    expect(got.mode).toBe('edit')
    expect(got.draft).toMatchObject({
      mine: true,
      started: true,
      stage: 'structure',
      count: 3,
      inherited: { source: 'submission', byName: '', count: 3, basedOn: { id: String(subA._id), byName: '', kind: 'submission' } },
    })
    expect(got.draft.ops).toEqual(subA.ops)
    expect(got.draft.inherited.ops).toEqual(subA.ops)
    // שם המתנדב הקודם אינו מגיע למתנדב (רק למנהל)
    expect(JSON.stringify(got.draft).includes('מתנדב א')).toBe(false)
    // פתיחה נוספת — אותה טיוטה, בלי ליצור חדשה
    expect((await open()).draft.started).toBe(false)
    expect(await PageProofDraft.countDocuments()).toBe(1)

    // ב' מחזיר את הזרם למקור, מוסיף תיקון משלו — ומגיש את הכול (גם מה שקיבל ולא שינה)
    const mine = [TEXT1, PARA2, TEXT2]
    expect((await PUT(req('PUT', { revision: 1, ops: mine, stage: 'text' }), p({ id: pid() }))).status).toBe(200)
    const r = await submit(mine)
    expect(r.success).toBe(true)
    const subB = await PageProofSubmission.findById(r.submissionId).lean()
    expect(subB).toMatchObject({ basedOnName: 'מתנדב א', basedOnKind: 'submission' })
    expect(String(subB.basedOn)).toBe(String(subA._id))
    expect(await PageProofDraft.countDocuments()).toBe(0)

    // סקירת-המנהל
    as(admin)
    const rv = await review(r.submissionId)
    expect(rv.submission.basedOn).toMatchObject({ id: String(subA._id), userName: 'מתנדב א', status: 'submitted', kind: 'submission', added: 1 })
    expect(rv.submission.basedOn.removed).toEqual([STREAM3])
    expect(rv.submission.basedOn.ops).toEqual(subA.ops)
    const idx = (op) => subA.ops.findIndex((o) => JSON.stringify(o) === JSON.stringify(op))
    expect(rv.submission.sameAs).toEqual(subB.ops.map((op) => (idx(op) >= 0 ? `${subA._id}:${idx(op)}` : null)))
    // ההגשה של א' — בלי basedOn
    expect((await review(String(subA._id))).submission.basedOn).toBeNull()
    // רשימת ההגשות של הספר (תוכנת-הספר)
    const list = await (await bookSubsGET(req('GET', null, `http://localhost/api/admin/page-proof/books/${GID}/submissions?status=submitted`), p({ gid: GID }))).json()
    const fromList = list.pages[0].submissions.find((s) => s.id === r.submissionId)
    expect(fromList.basedOn).toMatchObject({ id: String(subA._id), added: 1 })
    expect(fromList.sameAs).toEqual(rv.submission.sameAs)
  })

  it('קובץ-התיקונים: same_as לכל פעולה שזהה להגשה הקודמת — גם כשהקודמת נדחתה והשנייה היא הראשית', async () => {
    const subA = await PageProofSubmission.findOne({ user: a._id }).lean()
    as(b)
    await claimPOST(req('POST'), p({ id: pid() }))
    await open()
    const r = await submit([TEXT1, PARA2, TEXT2])
    as(admin)
    expect((await patch(String(subA._id), 'reject')).success).toBe(true)
    expect((await patch(r.submissionId, 'approve')).success).toBe(true)
    const file = await fixes()
    const ops = file.ops.filter((o) => o.op_id.startsWith(`${r.submissionId}:`))
    expect(ops.map((o) => o.same_as ?? null)).toEqual(ops.map((o) => {
      const j = subA.ops.findIndex((x) => x.kind === o.kind && JSON.stringify(x.ids) === JSON.stringify(o.ids) && JSON.stringify(x.value) === JSON.stringify(o.value))
      return j >= 0 ? `${subA._id}:${j}` : null
    }))
    expect(ops.some((o) => o.same_as)).toBe(true)
    expect(ops.some((o) => !o.same_as)).toBe(true)
  })

  it('קובץ-התיקונים: שתיהן אושרו — המצטברת (ב\') ראשית ו-א\' בקובץ הכפולים; א\' כבר יצאה — ב\' יוצאת בקובץ הראשי הבא כהמשך', async () => {
    const subA = await PageProofSubmission.findOne({ user: a._id }).lean()
    as(b)
    await claimPOST(req('POST'), p({ id: pid() }))
    await open()
    const r = await submit([TEXT1, PARA2, STREAM3, TEXT2])
    as(admin)
    expect((await patch(String(subA._id), 'approve')).success).toBe(true)
    // א' יוצאת בקובץ ראשי ("תיקונים חדשים") לפני שב' אושרה
    const firstFile = await fixes('?only=new&mark=1')
    expect(new Set(firstFile.ops.map((o) => o.op_id.split(':')[0]))).toEqual(new Set([String(subA._id)]))
    expect((await patch(r.submissionId, 'approve')).success).toBe(true)
    const primary = await fixes()
    expect(new Set(primary.ops.map((o) => o.op_id.split(':')[0]))).toEqual(new Set([r.submissionId]))
    // התיקון הנוסף של ב' בקובץ הראשי; מה שזהה ל-א' — עם same_as (לא מוחל פעמיים)
    const extra = primary.ops.find((o) => o.kind === 'text' && o.ids[0] === 2)
    expect(extra.same_as).toBeUndefined()
    expect(primary.ops.filter((o) => o.same_as).length).toBe(3)
    const next = await fixes('?only=new')
    expect(new Set(next.ops.map((o) => o.op_id.split(':')[0]))).toEqual(new Set([r.submissionId]))
    const double = await fixes('?set=double')
    expect(new Set(double.ops.map((o) => o.op_id.split(':')[0]))).toEqual(new Set([String(subA._id)]))
  })

  it('"התחל מאפס" — הטיוטה מתרוקנת ולא נבנית שוב מההגשה הקודמת; ההגשה אז אינה "מבוססת על"', async () => {
    as(b)
    await claimPOST(req('POST'), p({ id: pid() }))
    await open()
    expect((await PUT(req('PUT', { revision: 1, ops: [], reset: true }), p({ id: pid() }))).status).toBe(200)
    const again = await open()
    expect(again.draft).toMatchObject({ count: 0, inherited: null, started: false })
    const r = await submit([TEXT2])
    expect((await PageProofSubmission.findById(r.submissionId).lean()).basedOn).toBeNull()
  })
})
