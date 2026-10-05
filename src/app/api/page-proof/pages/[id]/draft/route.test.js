// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// הטיוטה בשרת (docs/63 §2) דרך הראוטים עצמם: PUT /pages/[id]/draft (רק המחזיק — 403/409), GET /pages/[id] (הטיוטה
// עם העמוד; למחזיק חדש — עוברת אליו ומסומנת; למנהל — לקריאה), ההגשה מוחקת אותה, וייבוא גרסה חדשה (חזר מזיהוי-
// מחדש) — הטיוטה עוברת אליה בפתיחה הבאה, בשלב "טקסט".

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
import { importPackages } from '@/lib/pageProof/importPackages'
import { DRAFT_MSG, DRAFT_RATE } from '@/lib/pageProof/draftRules'
import { PUT } from './route'
import { GET as pageGET } from '../route'
import { POST as submitPOST } from '../submit/route'
import { POST as recutPOST } from '../recut-request/route'
import { PATCH as settingsPATCH } from '@/app/api/admin/page-proof/settings/route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const GID = 'gDraftRoute1'
const HOUR = 3600 * 1000
const line = (id, extra = {}) => ({ id, line_no: id - 1, order: id, bbox: [100, id * 60, 900, id * 60 + 40], text: `שורה ${id}`, status: 'pending', stream: 'main', ...extra })
const doc = (page, revision = 1, lines = [line(1), line(2), line(3)]) => ({ page, revision, size: [1000, 2000], lines })
const TEXT = (page, v = 'מתוקנת') => ({ kind: 'text', page, ids: [1], value: `שורה 1 ${v}` })
const CUT = (page) => ({ kind: 'line_split', page, ids: [2], value: { x: 500 } })

let a
let b
let admin
let pages

const as = (u) =>
  getServerSessionMock.mockResolvedValue({ user: { id: String(u._id), _id: String(u._id), name: u.name, role: u.role || 'user', isVerified: true } })
const req = (method, body) => new Request('http://localhost/api/x', { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
const p = (o) => ({ params: Promise.resolve(o) })
const put = (n, body) => PUT(req('PUT', body), p({ id: String(pages[n]._id) }))
const open = async (n) => (await pageGET(req('GET'), p({ id: String(pages[n]._id) }))).json()
const draftOf = (n) => PageProofDraft.findOne({ page: pages[n]._id }).lean()
const lease = (n, u, hours = 40) => PageProofPage.updateOne({ _id: pages[n]._id }, { $set: { leasedBy: u?._id ?? null, leasedUntil: u ? new Date(Date.now() + hours * HOUR) : null } })

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  rateMock.mockReturnValue(true)
  a = await User.create({ name: 'מתנדב א', email: 'a@example.org', password: 'x', isVerified: true })
  b = await User.create({ name: 'מתנדב ב', email: 'b@example.org', password: 'x', isVerified: true })
  admin = await User.create({ name: 'מנהלת', email: 'm@example.org', password: 'x', role: 'admin_ocr' })
  const book = await PageProofBook.create({ gid: GID, title: 'ספר', script: 'square' })
  pages = {}
  for (const n of [1, 2, 3]) {
    pages[n] = await PageProofPage.create({
      book: book._id,
      gid: GID,
      page: n,
      seq: 0,
      doc: doc(n),
      lineCount: 3,
      imagePath: `/uploads/books/x/page.${n}.jpg`,
      leasedBy: a._id,
      leasedUntil: new Date(Date.now() + 5 * HOUR),
    })
  }
  as(a)
})

describe('PUT /api/page-proof/pages/[id]/draft', () => {
  it('המחזיק שומר; הפתיחה הבאה (גם "ממחשב אחר") מקבלת אותה עם העמוד, ושעון השרת', async () => {
    const res = await put(1, { revision: 1, ops: [TEXT(1), CUT(1)], stage: 'structure' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toMatchObject({ success: true, count: 2, dropped: 0, stage: 'structure', updatedAt: expect.any(String) })
    expect(rateMock).toHaveBeenCalledWith(`user:${a._id}`, 'page-proof-draft', DRAFT_RATE.tokens, DRAFT_RATE.interval)
    const got = await open(1)
    expect(got.mode).toBe('edit')
    expect(got.draft).toMatchObject({ mine: true, count: 2, stage: 'structure', byName: 'מתנדב א', inherited: null, handover: false })
    expect(got.draft.ops).toEqual([TEXT(1), CUT(1)])
    expect(Math.abs(Date.parse(got.now) - Date.now())).toBeLessThan(60000)
    expect(got.canRecut).toBe(true)
  })

  it('לא המחזיק ← 403 (not_holder); גרסה שהוחלפה ← 409 (reload); 401/400/404/413/429', async () => {
    as(b)
    let res = await put(1, { revision: 1, ops: [TEXT(1)] })
    expect([res.status, (await res.json()).code]).toEqual([403, 'not_holder'])
    as(a)
    res = await put(1, { revision: 2, ops: [TEXT(1)] })
    expect(await res.json()).toMatchObject({ success: false, code: 'reload', error: DRAFT_MSG.reload })
    expect(res.status).toBe(409)
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await put(1, { revision: 1, ops: [] })).status).toBe(401)
    expect((await PUT(req('PUT', { revision: 1, ops: [] }), p({ id: 'nope' }))).status).toBe(400)
    expect((await put(1, { revision: 1 })).status).toBe(400)
    expect((await PUT(req('PUT', { revision: 1, ops: [] }), p({ id: String(a._id) }))).status).toBe(404)
    const big = new Request('http://localhost/x', { method: 'PUT', headers: { 'content-type': 'application/json', 'content-length': String(5 * 1024 * 1024) }, body: '{}' })
    expect((await PUT(big, p({ id: String(pages[1]._id) }))).status).toBe(413)
    rateMock.mockReturnValueOnce(false)
    res = await put(1, { revision: 1, ops: [] })
    expect([res.status, (await res.json()).code]).toEqual([429, 'rate'])
    expect(await PageProofDraft.countDocuments()).toBe(0)
  })

  it('עמוד שעבר למתנדב אחר (התפיסה פגה): הטיוטה עוברת אליו בפתיחה, מסומנת כשל מתנדב קודם; הקודם כבר אינו כותב', async () => {
    expect((await put(2, { revision: 1, ops: [TEXT(2), { kind: 'line_ok', page: 2, ids: [3] }], stage: 'text' })).status).toBe(200)
    await lease(2, b)
    as(b)
    const got = await open(2)
    expect(got.mode).toBe('edit')
    expect(got.draft).toMatchObject({ mine: true, handover: true, stage: 'text', count: 2, inherited: { source: 'draft', count: 2 } })
    expect(JSON.stringify(got.draft).includes(String(a._id))).toBe(false)
    as(a)
    expect((await put(2, { revision: 1, ops: [] })).status).toBe(403)
    expect((await draftOf(2)).ops).toHaveLength(2)
  })

  it('מנהל רואה את הטיוטה של עמוד שאינו בטיפולו — לקריאה; מתנדב שאינו המחזיק — לא', async () => {
    await put(3, { revision: 1, ops: [TEXT(3)] })
    as(admin)
    const got = await open(3)
    expect(got.mode).toBe('view')
    expect(got.draft).toMatchObject({ mine: false, byName: 'מתנדב א', count: 1 })
    expect(String((await draftOf(3)).by)).toBe(String(a._id))
    as(b)
    const res = await pageGET(req('GET'), p({ id: String(pages[3]._id) }))
    expect(res.status).toBe(403)
  })

  it('הגשה מוחקת את הטיוטה (ודחייה אינה מחזירה אותה)', async () => {
    await put(1, { revision: 1, ops: [TEXT(1)] })
    const res = await submitPOST(req('POST', { revision: 1, ops: [TEXT(1)] }), p({ id: String(pages[1]._id) }))
    expect(res.status).toBe(200)
    expect(await draftOf(1)).toBeNull()
  })

  it('שליחה לזיהוי-מחדש: הטיוטה (שנשמרה קודם) עוברת לשלב "טקסט"; העמוד חוזר בגרסה חדשה — היא עוברת אליו בכלל של הדפדפן', async () => {
    await put(1, { revision: 1, ops: [TEXT(1), CUT(1), { kind: 'text', page: 1, ids: [2], value: 'על השורה שנחתכה' }], stage: 'structure' })
    const r = await recutPOST(req('POST', { revision: 1, ops: [CUT(1)] }), p({ id: String(pages[1]._id) }))
    expect(r.status).toBe(200)
    expect(await draftOf(1)).toMatchObject({ stage: 'text', recut: { sentAt: expect.any(Date) } })
    // תוכנת-הספר משכה את הבקשה (fixes?pages=recut&mark=1) ומייבאת את הגרסה החדשה
    await PageProofSubmission.updateMany({ page: pages[1]._id }, { $set: { exportedAt: new Date() } })
    const [res] = await importPackages(
      [{ meta: { gid: GID, title: 'ספר', script: 'square' }, pages: [{ doc: doc(1, 2, [line(1), line(21), line(22), line(3)]), imagePath: 'pages/p1.png' }] }],
      {},
      { links: new Map([[1, { imagePath: '/uploads/books/x/page.1.jpg', width: 1000, height: 2000, sitePage: null }]]) }
    )
    expect(res).toMatchObject({ recut: 1, recutReturned: 1 })
    const got = await open(1)
    expect(got.page.revision).toBe(2)
    expect(got.draft).toMatchObject({ revision: 2, stage: 'text', carried: { from: 1, kept: 1, cut: 1, dropped: ['טקסט: «על השורה שנחתכה»'] } })
    expect(got.draft.ops).toEqual([TEXT(1)])
  })
})

// שני השלבים (docs/63 §3) — מה שהשרת שומר ומחזיר; ההחלטה עצמה (מה קורה ב"✓ המבנה נכון") — בדפדפן (StagedEditor)
describe('שני השלבים — בשרת', () => {
  it('בלי שינוי-חיתוך: "טקסט" נשמר בטיוטה ועובר מחשב (הפתיחה הבאה — שלב "טקסט")', async () => {
    expect((await put(2, { revision: 1, ops: [], stage: 'structure' })).status).toBe(200)
    expect((await open(2)).draft.stage).toBe('structure')
    expect((await put(2, { revision: 1, ops: [TEXT(2)], stage: 'text' })).status).toBe(200)
    expect((await open(2)).draft).toMatchObject({ stage: 'text', count: 1 })
  })

  it('המתג של המנהל כבוי: canRecut=false, ובקשה ← 409 recut_off — העמוד נשאר אצל המתנדב והטיוטה בשלב שלו', async () => {
    as(admin)
    expect((await settingsPATCH(req('PATCH', { recutRequests: 'off' }))).status).toBe(200)
    as(a)
    await put(3, { revision: 1, ops: [TEXT(3), CUT(3)], stage: 'text' })
    const got = await open(3)
    expect(got.canRecut).toBe(false)
    expect(got.recutRequests).toBe(false)
    const r = await recutPOST(req('POST', { revision: 1, ops: [CUT(3)] }), p({ id: String(pages[3]._id) }))
    expect([r.status, (await r.json()).code]).toEqual([409, 'recut_off'])
    expect(await PageProofPage.findById(pages[3]._id).lean()).toMatchObject({ status: 'open' })
    expect(await draftOf(3)).toMatchObject({ stage: 'text', recut: null })
    // ההגשה כוללת את תיקוני-החיתוך (כמו היום)
    const sub = await submitPOST(req('POST', { revision: 1, ops: [TEXT(3), CUT(3)] }), p({ id: String(pages[3]._id) }))
    expect((await sub.json()).needsRecut).toBe(true)
  })

  it('עמוד עם הגשה של מתנדב אחר (כפול): canRecut=false — שינוי-חיתוך יוצא עם ההגשה', async () => {
    await PageProofPage.updateOne({ _id: pages[1]._id }, { $set: { required: 2, activeCount: 1, submitters: [b._id] } })
    expect((await open(1)).canRecut).toBe(false)
  })
})
