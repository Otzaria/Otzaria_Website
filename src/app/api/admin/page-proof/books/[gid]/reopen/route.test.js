// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// עריכה אחרי אישור — רק מנהל (docs/63 §5): "פתח מחדש לעריכה" (POST .../books/[gid]/reopen) רק למנהל OCR או למפתח-גישה
// עם הרשאת review; העמוד חוזר להיות פתוח, ההגשות שאושרו נשארות, ומי שתופס אותו (גם מי שהגיש) מתחיל מהגרסה שאושרה,
// מסומנת; ההגשה החדשה "מבוססת על" הגרסה ההיא, והאישור הבא — שוב בידי מנהל; בקובץ-התיקונים היא הראשית.

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
import PageProofToken from '@/models/PageProofToken'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { generateToken, hashToken } from '@/lib/pageProof/tokenSecret'
import { tokenPrefixOf } from '@/lib/pageProof/tokenRules'
import { REOPEN_MSG } from '@/lib/pageProof/reopenRules'
import { inverseOps } from '@/lib/pageProof/inverseOps'
import { POST } from './route'
import { GET as pageGET } from '@/app/api/page-proof/pages/[id]/route'
import { POST as submitPOST } from '@/app/api/page-proof/pages/[id]/submit/route'
import { POST as claimPOST } from '@/app/api/page-proof/pages/[id]/claim/route'
import { GET as bookGET } from '@/app/api/page-proof/books/[gid]/route'
import { GET as subGET, PATCH as subPATCH } from '@/app/api/admin/page-proof/submissions/[id]/route'
import { GET as fixesGET } from '@/app/api/admin/page-proof/books/[gid]/fixes/route'
import { GET as adminPagesGET } from '@/app/api/admin/page-proof/books/[gid]/pages/route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const GID = 'gReopen0001'
const HOUR = 3600e3
const line = (id) => ({ id, line_no: id - 1, order: id, bbox: [100, id * 60, 900, id * 60 + 40], text: `שורה ${id}`, status: 'pending', stream: 'main' })
const doc = (page) => ({ page, revision: 1, size: [1000, 2000], lines: [line(1), line(2), line(3)] })
const TEXT = (page) => ({ kind: 'text', page, ids: [1], value: 'שורה 1 שאושרה' })
const PARA = (page) => ({ kind: 'para', page, ids: [2], value: 'h2' })

let vol
let other
let admin
let pages
const keys = {}

const as = (u) =>
  getServerSessionMock.mockResolvedValue({ user: { id: String(u._id), _id: String(u._id), name: u.name, role: u.role || 'user', isVerified: true } })
const req = (method, body, headers = {}, url = 'http://localhost/api/x') =>
  new Request(url, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
const p = (o) => ({ params: Promise.resolve(o) })
const reopen = (ids, headers = {}) => POST(req('POST', { ids }, headers), p({ gid: GID }))
const pageOf = (n) => PageProofPage.findById(pages[n]._id).lean()

async function key(scopes) {
  const secret = generateToken()
  await PageProofToken.create({ user: admin._id, name: `מפתח ${scopes.join('+')}`, hash: hashToken(secret), prefix: tokenPrefixOf(secret), scopes, expiresAt: new Date(Date.now() + 30 * 24 * HOUR) })
  return { authorization: `Bearer ${secret}` }
}

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  rateMock.mockReturnValue(true)
  vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isVerified: true })
  other = await User.create({ name: 'מתנדב אחר', email: 'o@example.org', password: 'x', isVerified: true })
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
      leasedBy: vol._id,
      leasedUntil: new Date(Date.now() + 5 * HOUR),
    })
  }
  // עמוד 1: המתנדב הגיש, המנהלת אישרה (ויצא בקובץ) — "אושר"
  as(vol)
  const s1 = await (await submitPOST(req('POST', { revision: 1, ops: [TEXT(1), PARA(1)] }), p({ id: String(pages[1]._id) }))).json()
  as(admin)
  await subPATCH(req('PATCH', { action: 'approve' }), p({ id: s1.submissionId }))
  await PageProofSubmission.updateOne({ _id: s1.submissionId }, { $set: { exportedAt: new Date() } })
  // עמוד 2: הוגש וממתין לאישור
  as(vol)
  await submitPOST(req('POST', { revision: 1, ops: [TEXT(2)] }), p({ id: String(pages[2]._id) }))
  keys.review = await key(['read', 'review'])
  keys.read = await key(['read'])
  keys.import = await key(['import'])
  as(admin)
})

describe('POST /api/admin/page-proof/books/[gid]/reopen — רק מנהל', () => {
  it('מתנדב ← 403, בלי session ← 401, מפתח בלי review ← 403 — ושום עמוד לא נפתח', async () => {
    as(vol)
    expect((await reopen([String(pages[1]._id)])).status).toBe(403)
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await reopen([String(pages[1]._id)])).status).toBe(401)
    for (const k of [keys.read, keys.import]) {
      const r = await reopen([String(pages[1]._id)], k)
      expect([r.status, (await r.json()).code]).toEqual([403, 'token_scope'])
    }
    expect(await pageOf(1)).toMatchObject({ status: 'done', approvedCount: 1 })
  })

  it('מנהלת (session) ומפתח-גישה עם review — פותחים; עמוד שאינו מאושר — מדולג עם הסבר', async () => {
    const r = await reopen([String(pages[1]._id), String(pages[2]._id), String(pages[3]._id)])
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toMatchObject({ success: true, reopened: 1, pages: [1] })
    expect(body.skipped.map((s) => [s.page, s.error])).toEqual([
      [2, REOPEN_MSG.pending],
      [3, REOPEN_MSG.open],
    ])
    expect(await pageOf(1)).toMatchObject({ status: 'open', round: 1, activeCount: 0, approvedCount: 0, submitters: [], required: 1, leasedBy: null, reopenedByName: 'מנהלת' })
    // ההגשה שאושרה נשארת בהיסטוריה
    expect(await PageProofSubmission.countDocuments({ page: pages[1]._id, status: 'approved' })).toBe(1)
    // שוב — כבר פתוח
    expect((await (await reopen([String(pages[1]._id)], keys.review)).json()).skipped[0].error).toBe(REOPEN_MSG.open)
    // ברשת של המנהל: "נפתח מחדש"
    const grid = await (await adminPagesGET(req('GET', null, {}, `http://localhost/api/admin/page-proof/books/${GID}/pages`), p({ gid: GID }))).json()
    expect(grid.pages.find((x) => x.page === 1)).toMatchObject({ state: 'open', reopened: true })
  })

  it('עמוד כפול (שני בודקים) נשאר כפול אחרי פתיחה; גוף-בקשה גדול מדי ← 413', async () => {
    await PageProofPage.updateOne({ _id: pages[1]._id }, { $set: { required: 2, approvedCount: 2, activeCount: 2 } })
    expect((await (await reopen([String(pages[1]._id)])).json()).reopened).toBe(1)
    expect(await pageOf(1)).toMatchObject({ status: 'open', required: 2, approvedCount: 0, round: 1 })
    const big = POST(req('POST', { ids: [String(pages[2]._id)], pad: 'x'.repeat(70 * 1024) }), p({ gid: GID }))
    expect((await big).status).toBe(413)
    expect(await pageOf(2)).toMatchObject({ round: 0 })
  })

  it('במפתח-גישה עם review — פותח, והשם נרשם "(תוכנת-הספר)"', async () => {
    const r = await reopen([String(pages[1]._id)], keys.review)
    expect((await r.json()).reopened).toBe(1)
    expect((await pageOf(1)).reopenedByName).toMatch(/\(תוכנת-הספר\)$/)
  })

  it('אחרי פתיחה: מי שהגיש יכול לתפוס שוב, מתחיל מהגרסה שאושרה (מסומנת); ההגשה החדשה "מבוססת על", ובקובץ — הראשית', async () => {
    const s1 = await PageProofSubmission.findOne({ page: pages[1]._id }).lean()
    await PageProofDraft.create({ page: pages[1]._id, by: other._id, ops: [TEXT(1)] })
    expect((await (await reopen([String(pages[1]._id)])).json()).reopened).toBe(1)
    expect(await PageProofDraft.countDocuments({ page: pages[1]._id }), 'טיוטה ישנה נמחקת').toBe(0)

    as(vol)
    const grid = await (await bookGET(req('GET'), p({ gid: GID }))).json()
    expect(grid.pages.find((x) => x.page === 1).state).toBe('open')
    expect((await claimPOST(req('POST'), p({ id: String(pages[1]._id) }))).status).toBe(200)
    const got = await (await pageGET(req('GET'), p({ id: String(pages[1]._id) }))).json()
    expect(got.mode).toBe('edit')
    expect(got.submission).toBeNull()
    expect(got.draft).toMatchObject({ started: true, stage: 'structure', inherited: { source: 'approved', count: 2, basedOn: { id: String(s1._id), kind: 'approved' } } })
    expect(got.draft.ops).toEqual(s1.ops)

    const mine = [TEXT(1), { kind: 'stream', page: 1, ids: [3], value: 'notes' }]
    const r = await (await submitPOST(req('POST', { revision: 1, ops: mine }), p({ id: String(pages[1]._id) }))).json()
    expect(r.success).toBe(true)
    const s2 = await PageProofSubmission.findById(r.submissionId).lean()
    expect(s2).toMatchObject({ round: 1, basedOnKind: 'approved' })
    expect(String(s2.basedOn)).toBe(String(s1._id))
    expect(await pageOf(1)).toMatchObject({ status: 'done', activeCount: 1, approvedCount: 0 })

    // המנהלת: "מבוססת על הגרסה שאושרה", ומאשרת — זו הראשית בקובץ, וה-same_as מצביע על הגרסה שאושרה
    as(admin)
    expect((await (await subGET(req('GET'), p({ id: r.submissionId }))).json()).submission.basedOn).toMatchObject({ id: String(s1._id), kind: 'approved', status: 'approved' })
    expect((await (await subPATCH(req('PATCH', { action: 'approve' }), p({ id: r.submissionId }))).json()).pageStatus).toBe('done')
    expect(await pageOf(1)).toMatchObject({ status: 'done', approvedCount: 1 })
    const file = JSON.parse(await (await fixesGET(req('GET', null, {}, `http://localhost/api/admin/page-proof/books/${GID}/fixes`), p({ gid: GID }))).text())
    const forPage = file.ops.filter((o) => o.page === 1)
    expect(new Set(forPage.map((o) => o.op_id.split(':')[0]))).toEqual(new Set([String(s2._id)]))
    expect(forPage.find((o) => o.kind === 'text').same_as).toBe(`${s1._id}:${s1.ops.findIndex((o) => o.kind === 'text')}`)
    expect(forPage.find((o) => o.kind === 'stream').same_as).toBeUndefined()
  })

  it('"החזר למקור" על שינוי מהגרסה שאושרה — הפעולה ההפוכה (זהה לטקסט המקורי) עוברת את האריזה בהגשה ויוצאת בקובץ-התיקונים', async () => {
    await reopen([String(pages[1]._id)])
    as(vol)
    await claimPOST(req('POST'), p({ id: String(pages[1]._id) }))
    await pageGET(req('GET'), p({ id: String(pages[1]._id) }))
    // מה שהעורך שולח אחרי "החזר למקור" על תיקון-הטקסט ועל המחיקה: ההפוכות (revert) במקומן, והשאר כמות-שהוא
    const removed = { kind: 'status', page: 1, ids: [3], value: 'removed' }
    const inv = [...inverseOps(doc(1), TEXT(1)), ...inverseOps(doc(1), removed)]
    expect(inv.map((o) => [o.kind, o.value, o.revert])).toEqual([['text', 'שורה 1', true], ['status', 'restore', true]])
    const r = await (await submitPOST(req('POST', { revision: 1, ops: [...inv, PARA(1)] }), p({ id: String(pages[1]._id) }))).json()
    expect(r.success).toBe(true)
    const s2 = await PageProofSubmission.findById(r.submissionId).lean()
    expect(s2.ops.map((o) => [o.kind, o.value, o.revert ?? null])).toEqual([['text', 'שורה 1', true], ['status', 'restore', true], ['para', 'h2', null]])
    as(admin)
    await subPATCH(req('PATCH', { action: 'approve' }), p({ id: r.submissionId }))
    const file = JSON.parse(await (await fixesGET(req('GET', null, {}, `http://localhost/api/admin/page-proof/books/${GID}/fixes`), p({ gid: GID }))).text())
    const forPage = file.ops.filter((o) => o.page === 1)
    expect(forPage.find((o) => o.kind === 'text')).toMatchObject({ value: 'שורה 1', revert: true, revert_status: 'pending' })
    expect(forPage.find((o) => o.kind === 'status')).toMatchObject({ value: 'restore', revert: true })
  })

  it('דחיית ההגשה הישנה (מהסבב הקודם) אחרי פתיחה — אינה נוגעת במונים של הסבב החדש', async () => {
    const s1 = await PageProofSubmission.findOne({ page: pages[1]._id }).lean()
    await PageProofSubmission.updateOne({ _id: s1._id }, { $set: { exportedAt: null } })
    await reopen([String(pages[1]._id)])
    as(vol)
    await claimPOST(req('POST'), p({ id: String(pages[1]._id) }))
    await pageGET(req('GET'), p({ id: String(pages[1]._id) }))
    await submitPOST(req('POST', { revision: 1, ops: [TEXT(1)] }), p({ id: String(pages[1]._id) }))
    as(admin)
    expect((await (await subPATCH(req('PATCH', { action: 'reject' }), p({ id: String(s1._id) }))).json()).success).toBe(true)
    expect(await pageOf(1)).toMatchObject({ status: 'done', activeCount: 1, approvedCount: 0, round: 1 })
  })
})
