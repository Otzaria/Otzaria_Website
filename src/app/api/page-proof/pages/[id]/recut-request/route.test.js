// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// "שלח לזיהוי-מחדש" — הבקשה של המתנדב והלולאה כולה, מול מסד אמיתי:
//   בקשה (רק פעולות-החיתוך, "מאושרת" לזיהוי-מחדש; העמוד ל-'recut') ← תוכנת-הספר מושכת אותה
//   במפתח-הגישה (fixes?pages=recut&mark=1) ← ייבוא הגרסה החדשה ← העמוד חוזר למבקש (48 שעות, בלי שבת וחג).
//   וגם: אחת לעמוד, עד 5 ממתינות למתנדב, האטה, רק עמוד שבטיפולו; "העמודים שלי" ורשת המנהל
//   מראים את ההמתנה; ביטול בידי המנהל ("שחרור מהמתנה") מחזיר את העמוד למבקש ואינו חוזר.

const { getServerSessionMock, rateMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn(), rateMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateMock }))

import User from '@/models/User'
import PageProofBook from '@/models/PageProofBook'
import PageProofPage from '@/models/PageProofPage'
import PageProofSubmission from '@/models/PageProofSubmission'
import PageProofToken from '@/models/PageProofToken'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { generateToken, hashToken } from '@/lib/pageProof/tokenSecret'
import { tokenPrefixOf } from '@/lib/pageProof/tokenRules'
import { importPackages } from '@/lib/pageProof/importPackages'
import { MAX_PENDING_RECUT, RECUT_CANCEL_NOTE, RECUT_MSG, RECUT_RATE, RECUT_REVIEWER } from '@/lib/pageProof/recutRules'
// 48 שעות — בלי שבת וחג (lease.leaseEnd)
import { leaseEnd } from '@/lib/pageProof/lease'
import { POST } from './route'
import { POST as submitPOST } from '../submit/route'
import { GET as mineGET } from '@/app/api/page-proof/mine/route'
import { GET as fixesGET } from '@/app/api/admin/page-proof/books/[gid]/fixes/route'
import { GET as adminPagesGET } from '@/app/api/admin/page-proof/books/[gid]/pages/route'
import { PATCH as subPATCH } from '@/app/api/admin/page-proof/submissions/[id]/route'
import { GET as settingsGET, PATCH as settingsPATCH } from '@/app/api/admin/page-proof/settings/route'
import { POST as releasePOST } from '@/app/api/admin/page-proof/recut-requests/release/route'

// מסד אמיתי — תחת עומס (כל הבדיקות במקביל) בקשות רבות לוקחות יותר מ-5 שניות
vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

const GID = 'gRecutReq01'
const HOUR = 3600 * 1000
const line = (id, extra = {}) => ({ id, line_no: id - 1, order: id, bbox: [100, id * 60, 900, id * 60 + 40], text: `שורה ${id}`, status: 'pending', stream: 'main', ...extra })
const doc = (page, revision = 1, lines = [line(1), line(2), line(3)]) => ({ page, revision, size: [1000, 2000], lines })
const CUT = (page) => [{ kind: 'line_split', page, ids: [2], value: { x: 500 } }]
const TEXT = (page) => [{ kind: 'text', page, ids: [1], value: `שורה 1 מתוקנת (${page})` }]

let vol
let other
let admin
let pages
let secret

const as = (u) =>
  getServerSessionMock.mockResolvedValue({ user: { id: String(u._id), _id: String(u._id), name: u.name, role: u.role || 'user', isVerified: true } })
const post = (body) => new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const p = (o) => ({ params: Promise.resolve(o) })
const send = (n, body) => POST(post(body), p({ id: String(pages[n]._id) }))
const request = (n) => send(n, { revision: 1, ops: [...TEXT(n), ...CUT(n)] })
const pageOf = (n) => PageProofPage.findById(pages[n]._id).lean()
const mine = async () => (await mineGET(new Request('http://localhost/api/page-proof/mine'))).json()
const close = (a, b, ms = 5000) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < ms

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  rateMock.mockReturnValue(true)
  vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isVerified: true })
  other = await User.create({ name: 'מתנדב אחר', email: 'o@example.org', password: 'x', isVerified: true })
  admin = await User.create({ name: 'מנהל', email: 'a@example.org', password: 'x', role: 'admin_ocr' })
  const book = await PageProofBook.create({ gid: GID, title: 'ספר', script: 'square' })
  pages = {}
  for (const n of [1, 2, 3, 4, 5, 6, 7]) {
    pages[n] = await PageProofPage.create({
      book: book._id,
      gid: GID,
      page: n,
      seq: Math.floor((n - 1) / 5),
      doc: doc(n),
      lineCount: 3,
      // תמונה "מקושרת" (לא תחת תיקיית הגהת-העמודים) — הייבוא לא כותב ולא מוחק קבצים
      imagePath: `/uploads/books/x/page.${n}.jpg`,
      leasedBy: n === 7 ? other._id : vol._id,
      leasedUntil: new Date(Date.now() + 5 * HOUR),
    })
  }
  secret = generateToken()
  await PageProofToken.create({ user: admin._id, name: 'תוכנה', hash: hashToken(secret), prefix: tokenPrefixOf(secret), scopes: ['read', 'review', 'import'], expiresAt: new Date(Date.now() + 30 * 24 * HOUR) })
  as(vol)
})

describe('הבקשה', () => {
  it('רק פעולות-החיתוך נשמרות, כ"מאושרת" לזיהוי-מחדש; העמוד ל-recut, התפיסה משתחררת, המונים לא זזים', async () => {
    const res = await request(1)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body).toMatchObject({ success: true, opCount: 1, pending: 1 })

    const page = await pageOf(1)
    expect(page).toMatchObject({ status: 'recut', leasedBy: null, leasedUntil: null, activeCount: 0, approvedCount: 0, submitters: [] })
    const sub = await PageProofSubmission.findById(body.submissionId).lean()
    expect(sub).toMatchObject({
      recutRequest: true,
      status: 'approved',
      needsRecut: true,
      revision: 1,
      pageNo: 1,
      who: `otz-${vol._id}`,
      userName: 'מתנדב',
      reviewedByName: RECUT_REVIEWER,
      recutDoneAt: null,
      exportedAt: null,
    })
    expect(sub.ops).toEqual(CUT(1))
    expect(rateMock).toHaveBeenCalledWith(`user:${vol._id}`, 'page-proof-recut-request', RECUT_RATE.tokens, RECUT_RATE.interval)
  })

  it('אחת לעמוד: שליחה שנייה ← 409; הגשה רגילה בזמן ההמתנה ← 409', async () => {
    expect((await request(1)).status).toBe(200)
    const again = await request(1)
    expect(again.status).toBe(409)
    expect((await again.json()).error).toMatch(/כבר ממתין לזיהוי-מחדש/)
    const sub = await submitPOST(post({ revision: 1, ops: TEXT(1) }), p({ id: String(pages[1]._id) }))
    expect(sub.status).toBe(409)
    expect(await PageProofSubmission.countDocuments({ page: pages[1]._id })).toBe(1)
  })

  it(`עד ${MAX_PENDING_RECUT} ממתינות למתנדב — השישית נדחית והעמוד נשאר בידיו`, async () => {
    for (const n of [1, 2, 3, 4, 5]) expect((await request(n)).status, `עמוד ${n}`).toBe(200)
    const res = await request(6)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(RECUT_MSG.tooMany)
    expect(await pageOf(6)).toMatchObject({ status: 'open', leasedBy: vol._id })
  })

  it('רק עמוד שבטיפולו, בגרסה שנפתחה, בלי הגשה של אחר — ורק כשיש תיקוני-חיתוך', async () => {
    // תפוס בידי מתנדב אחר
    let res = await request(7)
    expect([res.status, (await res.json()).error]).toEqual([409, expect.stringMatching(/אינו בטיפולכם/)])
    // גרסה אחרת / בלי גרסה
    for (const revision of [2, undefined, '1']) {
      res = await send(1, { revision, ops: CUT(1) })
      expect([res.status, (await res.json()).error], String(revision)).toEqual([409, RECUT_MSG.reload])
    }
    // רק טקסט
    res = await send(1, { revision: 1, ops: TEXT(1) })
    expect([res.status, (await res.json()).error]).toEqual([400, RECUT_MSG.noCut])
    // פעולת-חיתוך לא תקינה — אותה בדיקה של הגשה
    res = await send(1, { revision: 1, ops: [{ kind: 'line_split', page: 1, ids: [99], value: { x: 500 } }] })
    expect(res.status).toBe(400)
    // עמוד כפול שמתנדב אחר כבר הגיש
    await PageProofPage.updateOne({ _id: pages[2]._id }, { $set: { required: 2, activeCount: 1, submitters: [other._id] } })
    res = await request(2)
    expect([res.status, (await res.json()).error]).toEqual([409, expect.stringMatching(/הגשה של מתנדב אחר/)])
    // התפיסה פגה
    await PageProofPage.updateOne({ _id: pages[3]._id }, { $set: { leasedUntil: new Date(Date.now() - HOUR) } })
    expect((await request(3)).status).toBe(409)
    // מזהה לא תקין / עמוד שאינו קיים / גוף חסר
    expect((await POST(post({ revision: 1, ops: CUT(1) }), p({ id: 'nope' }))).status).toBe(400)
    expect((await POST(post({ revision: 1, ops: CUT(1) }), p({ id: String(vol._id) }))).status).toBe(404)
    expect((await send(1, { revision: 1 })).status).toBe(400)
    // שום דבר לא השתנה
    expect(await PageProofSubmission.countDocuments()).toBe(0)
    expect(await PageProofPage.countDocuments({ status: 'recut' })).toBe(0)
  })

  it('בלי התחברות ← 401; משתמש לא מאומת ← 403; האטה ← 429 — בלי לגעת במסד', async () => {
    getServerSessionMock.mockResolvedValueOnce(null)
    expect((await request(1)).status).toBe(401)
    getServerSessionMock.mockResolvedValueOnce({ user: { id: String(vol._id), role: 'user', isVerified: false } })
    expect((await request(1)).status).toBe(403)
    rateMock.mockReturnValueOnce(false)
    const res = await request(1)
    expect([res.status, (await res.json()).error]).toEqual([429, RECUT_MSG.rate])
    expect((await pageOf(1)).status).toBe('open')
  })
})

describe('בזמן ההמתנה', () => {
  it('"העמודים שלי" מראים אותו בהמתנה (לא כעמוד בטיפול), והוא אינו "הגשה" בסטטיסטיקה', async () => {
    expect((await request(2)).status).toBe(200)
    const m = await mine()
    expect(m.recutPending).toEqual([{ id: String(pages[2]._id), gid: GID, title: 'ספר', page: 2, requestedAt: expect.any(String), picked: false }])
    const heldIds = m.held.flatMap((s) => s.pages.filter((x) => x.state === 'mine').map((x) => x.id))
    expect(heldIds).not.toContain(String(pages[2]._id))
    expect(m.held[0].pages.find((x) => x.id === String(pages[2]._id)).state).toBe('recut')
    expect(m.stats).toMatchObject({ mySubmitted: 0, myApproved: 0 })
  })

  it('ברשת של המנהל: מי ביקש ומתי, ומזהה הבקשה (לביטול)', async () => {
    const body = await (await request(2)).json()
    as(admin)
    const grid = await (await adminPagesGET(new Request(`http://localhost/api/admin/page-proof/books/${GID}/pages`), p({ gid: GID }))).json()
    const byNo = Object.fromEntries(grid.pages.map((x) => [x.page, x]))
    expect(byNo[2]).toMatchObject({ state: 'recut', recutRequest: { id: body.submissionId, by: 'מתנדב', picked: false } })
    expect(byNo[2].recutRequest.at).toBeTruthy()
    expect(byNo[1].recutRequest).toBeNull()
    expect(grid.counts.recut).toBe(1)
  })
})

describe('הלולאה עם תוכנת-הספר', () => {
  it('מושכת במפתח (fixes?pages=recut&mark=1), מייבאת גרסה חדשה — והעמוד חוזר למבקש ל-48 שעות', async () => {
    const { submissionId } = await (await request(1)).json()

    const auth = { authorization: `Bearer ${secret}` }
    const fixes = await fixesGET(new Request(`http://localhost/api/admin/page-proof/books/${GID}/fixes?pages=recut&mark=1`, { headers: auth }), p({ gid: GID }))
    expect(fixes.status).toBe(200)
    const file = JSON.parse(await fixes.text())
    expect(file.ops).toEqual([
      { kind: 'line_split', page: 1, ids: [2], value: { x: 500 }, who: `otz-${vol._id}`, when: expect.any(String), revision: 1, op_id: `${submissionId}:0`, sig: expect.stringMatching(/^1:/) },
    ])
    expect((await PageProofSubmission.findById(submissionId).lean()).exportedAt).not.toBeNull()
    expect((await mine()).recutPending[0].picked).toBe(true)

    // הגרסה החדשה: שורה 2 נחתכה לשתיים
    const now = Date.now()
    const [res] = await importPackages(
      [{ meta: { gid: GID, title: 'ספר', script: 'square' }, pages: [{ doc: doc(1, 2, [line(1), line(21), line(22), line(3)]), imagePath: 'pages/p1.png' }] }],
      {},
      { links: new Map([[1, { imagePath: '/uploads/books/x/page.1.jpg', width: 1000, height: 2000, sitePage: null }]]) }
    )
    expect(res).toMatchObject({ recut: 1, recutReturned: 1, errors: [] })

    const page = await pageOf(1)
    expect(page).toMatchObject({ status: 'open', revision: 2, activeCount: 0, submitters: [] })
    expect(String(page.leasedBy)).toBe(String(vol._id))
    expect(close(page.leasedUntil, leaseEnd(now), 60 * 1000)).toBe(true)
    expect((await PageProofSubmission.findById(submissionId).lean()).recutDoneAt).not.toBeNull()
    const m = await mine()
    expect(m.recutPending).toEqual([])
    expect(m.held[0].pages.find((x) => x.id === String(pages[1]._id))).toMatchObject({ state: 'mine', revision: 2 })

    // המתנדב ממשיך: הגשה רגילה של הגרסה החדשה
    const sub = await submitPOST(post({ revision: 2, ops: TEXT(1) }), p({ id: String(pages[1]._id) }))
    expect(sub.status).toBe(200)
  })

  it('עמוד שחזר מזיהוי-מחדש בגלל הגשה שמנהל אישר — חוזר למאגר, לא למתנדב (כמו תמיד)', async () => {
    await PageProofPage.updateOne({ _id: pages[4]._id }, { $set: { status: 'recut', leasedBy: null, leasedUntil: null, activeCount: 1, approvedCount: 1, submitters: [other._id] } })
    await PageProofSubmission.create({ page: pages[4]._id, book: pages[4].book, gid: GID, pageNo: 4, user: other._id, who: `otz-${other._id}`, ops: CUT(4), opCount: 1, needsRecut: true, status: 'approved', reviewedAt: new Date(), exportedAt: new Date() })
    const [res] = await importPackages(
      [{ meta: { gid: GID, title: 'ספר', script: 'square' }, pages: [{ doc: doc(4, 2), imagePath: 'x' }] }],
      {},
      { links: new Map([[4, { imagePath: '/uploads/books/x/page.4.jpg', width: 1000, height: 2000, sitePage: null }]]) }
    )
    expect(res).toMatchObject({ recut: 1, recutReturned: 0 })
    expect(await pageOf(4)).toMatchObject({ status: 'open', revision: 2, leasedBy: null, leasedUntil: null })
  })
})

describe('המנהל', () => {
  it('ביטול ("שחרור מהמתנה"): הבקשה מבוטלת והעמוד חוזר למבקש; הגשה רגילה אחר כך אינה מחזירה אותו לזיהוי-מחדש', async () => {
    const { submissionId } = await (await request(3)).json()
    as(admin)
    const res = await subPATCH(new Request('http://localhost/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'release_recut' }) }), p({ id: submissionId }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, status: 'rejected', pageStatus: 'open', canceledRequests: 1, returnedToRequester: true })
    const page = await pageOf(3)
    expect(page).toMatchObject({ status: 'open', revision: 1 })
    expect(String(page.leasedBy)).toBe(String(vol._id))
    expect(close(page.leasedUntil, leaseEnd(Date.now()), 60 * 1000)).toBe(true)
    expect(await PageProofSubmission.findById(submissionId).lean()).toMatchObject({ status: 'rejected', reviewNote: RECUT_CANCEL_NOTE, reviewedByName: 'מנהל' })

    as(vol)
    expect((await mine()).recutPending).toEqual([])
    expect((await submitPOST(post({ revision: 1, ops: TEXT(3) }), p({ id: String(pages[3]._id) }))).status).toBe(200)
    expect((await pageOf(3)).status).toBe('done')
    // קובץ-התיקונים: הבקשה שבוטלה אינה יוצאת
    as(admin)
    const file = JSON.parse(await (await fixesGET(new Request(`http://localhost/api/admin/page-proof/books/${GID}/fixes`), p({ gid: GID }))).text())
    expect(file.ops.filter((o) => o.kind === 'line_split')).toEqual([])
  })

  it('בקשה אינה נדחית ב"דחייה" (לא נספרה במונים) — 409, ואישור — "כבר טופלה"; שום דבר לא משתנה', async () => {
    const { submissionId } = await (await request(4)).json()
    as(admin)
    const patch = (action) => subPATCH(new Request('http://localhost/x', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) }), p({ id: submissionId }))
    const rej = await patch('reject')
    expect(rej.status).toBe(409)
    expect((await rej.json()).error).toMatch(/שחרור מהמתנה/)
    expect((await patch('approve')).status).toBe(409)
    expect(await pageOf(4)).toMatchObject({ status: 'recut', activeCount: 0, approvedCount: 0 })
    expect((await PageProofSubmission.findById(submissionId).lean()).status).toBe('approved')
  })
})

// מתג המנהל (2026-10-02): פועל / כבוי / אוטומטי — "אוטומטי" = תוכנת-הספר נראתה ב-15 הדקות האחרונות
// (מפתח-גישה עם הרשאת import שהשתמשו בו); ו"החזר את כל הממתינים למתנדבים"
describe('מתג המנהל לשליחת מתנדבים לזיהוי-מחדש', () => {
  const settingsReq = (method, body, authorization) =>
    new Request('http://localhost/api/admin/page-proof/settings', {
      method,
      headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  const setMode = async (recutRequests) => {
    as(admin)
    const res = await settingsPATCH(settingsReq('PATCH', { recutRequests }))
    expect(res.status).toBe(200)
    as(vol)
    return res.json()
  }
  const seen = (minutesAgo) => PageProofToken.updateMany({}, { $set: { lastUsedAt: new Date(Date.now() - minutesAgo * 60 * 1000) } })

  it('ברירת-המחדל — פועל; כבוי ← 409 recut_off בלי לגעת במסד, ו"העמודים שלי" אומר שהכפתור סגור', async () => {
    expect((await mine()).recutRequests).toBe(true)
    const body = await setMode('off')
    expect(body).toMatchObject({ success: true, settings: { recutRequests: 'off', autoMinutes: 15 }, effective: { recutRequests: false } })
    const res = await request(1)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ success: false, error: RECUT_MSG.off, code: 'recut_off' })
    expect(await pageOf(1)).toMatchObject({ status: 'open' })
    expect(await PageProofSubmission.countDocuments()).toBe(0)
    expect((await mine()).recutRequests).toBe(false)
  })

  it('אוטומטי: תוכנת-הספר לא נראתה 20 דקות ← 409; נראתה לפני דקה ← הבקשה עוברת', async () => {
    await setMode('auto')
    await seen(20)
    expect((await request(1)).status).toBe(409)
    await seen(1)
    expect((await mine()).recutRequests).toBe(true)
    expect((await request(1)).status).toBe(200)
  })

  it('GET/PATCH: מנהל OCR, או מפתח-גישה (קריאה ב-read); מתנדב ← 403; ערך לא מוכר ← 400', async () => {
    await request(1)
    await seen(30)
    const res = await settingsGET(settingsReq('GET', null, `Bearer ${secret}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body).toMatchObject({ success: true, settings: { recutRequests: 'on' }, effective: { recutRequests: true }, pendingRecut: { waiting: 1, picked: 0 } })
    // הקריאה עצמה במפתח היא "תוכנת-הספר נראתה" — עכשיו (tokenAuth מעדכן lastUsedAt)
    expect(close(body.bookSoftwareSeenAt, Date.now(), 60 * 1000)).toBe(true)
    expect((await settingsPATCH(settingsReq('PATCH', { recutRequests: 'off' }))).status).toBe(403)
    as(admin)
    expect((await settingsPATCH(settingsReq('PATCH', { recutRequests: 'maybe' }))).status).toBe(400)
    const viaKey = await settingsPATCH(settingsReq('PATCH', { recutRequests: 'auto', autoMinutes: 30 }, `Bearer ${secret}`))
    expect(await viaKey.json()).toMatchObject({ settings: { recutRequests: 'auto', autoMinutes: 30 } })
  })

  it('"החזר את כל הממתינים למתנדבים": מה שעוד לא נמשך — חוזר למבקש (תפיסה מחודשת); מה שכבר בתוכנה — נשאר', async () => {
    const { submissionId: s1 } = await (await request(1)).json()
    const { submissionId: s2 } = await (await request(2)).json()
    await PageProofSubmission.updateOne({ _id: s2 }, { $set: { exportedAt: new Date() } })
    await setMode('off')
    expect(await pageOf(1), 'כיבוי אינו מבטל בקשות שממתינות').toMatchObject({ status: 'recut' })
    as(admin)
    const res = await releasePOST(new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, released: 1, skipped: 0, picked: 1 })
    const page = await pageOf(1)
    expect(page).toMatchObject({ status: 'open' })
    expect(String(page.leasedBy)).toBe(String(vol._id))
    expect(close(page.leasedUntil, leaseEnd(Date.now()), 60 * 1000)).toBe(true)
    expect(await PageProofSubmission.findById(s1).lean()).toMatchObject({ status: 'rejected', reviewNote: RECUT_CANCEL_NOTE })
    expect(await pageOf(2)).toMatchObject({ status: 'recut' })
    expect((await PageProofSubmission.findById(s2).lean()).status).toBe('approved')
    as(vol)
    expect((await releasePOST(new Request('http://localhost/x', { method: 'POST', body: '{}' }))).status).toBe(403)
  })
})
